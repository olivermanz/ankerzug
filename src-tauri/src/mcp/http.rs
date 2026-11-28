use super::{bridge, settings::Settings};
use http_body_util::{BodyExt, Full, LengthLimitError, Limited};
use hyper::{
    Method, Request, Response, StatusCode,
    body::{Bytes, Incoming},
    header,
    server::conn::http1,
    service::service_fn,
};
use hyper_util::rt::TokioIo;
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::{net::TcpListener, sync::oneshot, task::JoinSet, time::timeout};

const MAX_CONNECTIONS: usize = 16;
const MAX_BODY_BYTES: usize = 16 * 1024;
const BODY_TIMEOUT: Duration = Duration::from_secs(2);
const IPC_TIMEOUT: Duration = Duration::from_secs(5);
const MCP_HEADERS: [&str; 5] = [
    "accept",
    "content-type",
    "mcp-protocol-version",
    "mcp-method",
    "mcp-name",
];

pub(super) async fn serve(
    listener: TcpListener,
    state: Arc<super::Shared>,
    mut stop: oneshot::Receiver<()>,
) {
    let port = listener.local_addr().expect("bound MCP listener").port();
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            _ = &mut stop => break,
            _ = connections.join_next(), if !connections.is_empty() => {},
            accepted = listener.accept(), if connections.len() < MAX_CONNECTIONS => {
                let Ok((socket, _)) = accepted else {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    continue;
                };
                let state = state.clone();
                connections.spawn(async move {
                    let service = service_fn(move |request| {
                        let state = state.clone();
                        async move { Ok::<_, Infallible>(handle(request, &state, port).await) }
                    });
                    let connection = http1::Builder::new()
                        .keep_alive(false)
                        .serve_connection(TokioIo::new(socket), service);
                    let _ = timeout(Duration::from_secs(10), connection).await;
                });
            }
        }
    }
    drop(listener);
    connections.shutdown().await;
}

fn reply(status: StatusCode, body: impl Into<Bytes>) -> Response<Full<Bytes>> {
    let mut response = Response::new(Full::new(body.into()));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if status == StatusCode::METHOD_NOT_ALLOWED {
        response
            .headers_mut()
            .insert(header::ALLOW, "POST".parse().unwrap());
    }
    if status == StatusCode::UNAUTHORIZED {
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
    }
    response
}

fn authorized(headers: &header::HeaderMap, settings: &Settings) -> bool {
    if !settings.authentication {
        return true;
    }
    let mut entries = headers.get_all(header::AUTHORIZATION).iter();
    let Some((scheme, token)) = entries
        .next()
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split_once(' '))
    else {
        return false;
    };
    entries.next().is_none()
        && scheme.eq_ignore_ascii_case("Bearer")
        && !settings.token.is_empty()
        && constant_time_eq::constant_time_eq(token.as_bytes(), settings.token.as_bytes())
}

fn valid_destination(request: &Request<Incoming>, port: u16) -> bool {
    let mut hosts = request.headers().get_all(header::HOST).iter();
    let Some(host) = hosts.next().and_then(|value| value.to_str().ok()) else {
        return false;
    };
    // The endpoint is for local native clients. No browser origins are allowed.
    hosts.next().is_none()
        && !request.headers().contains_key(header::ORIGIN)
        && request.uri().authority().is_none()
        && (host.eq_ignore_ascii_case(&format!("localhost:{port}"))
            || host == format!("127.0.0.1:{port}"))
}

async fn handle(
    request: Request<Incoming>,
    state: &super::Shared,
    port: u16,
) -> Response<Full<Bytes>> {
    if !valid_destination(&request, port) {
        return reply(StatusCode::FORBIDDEN, "Invalid Host or Origin");
    }
    if request.uri().path_and_query().map(|uri| uri.as_str()) != Some("/mcp") {
        return reply(StatusCode::NOT_FOUND, "Not found");
    }
    let (parts, body) = request.into_parts();
    if !authorized(&parts.headers, &state.settings.read().unwrap()) {
        return reply(StatusCode::UNAUTHORIZED, "Invalid bearer token");
    }
    if parts.method != Method::POST {
        return reply(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed");
    }
    let bytes = match timeout(BODY_TIMEOUT, Limited::new(body, MAX_BODY_BYTES).collect()).await {
        Ok(Ok(body)) => body.to_bytes(),
        Ok(Err(error)) if error.is::<LengthLimitError>() => {
            return reply(StatusCode::PAYLOAD_TOO_LARGE, "Request body too large");
        }
        Ok(Err(_)) => return reply(StatusCode::BAD_REQUEST, "Invalid request body"),
        Err(_) => return reply(StatusCode::REQUEST_TIMEOUT, "Request body timed out"),
    };
    let Ok(body) = String::from_utf8(bytes.into()) else {
        return reply(StatusCode::BAD_REQUEST, "Request body must be UTF-8");
    };
    let mode = {
        let settings = state.settings.read().unwrap();
        if !settings.enabled {
            return reply(StatusCode::SERVICE_UNAVAILABLE, "MCP is disabled");
        }
        // Recheck after reading the body to enforce rotations and access changes
        // made while an HTTP client was still sending the request.
        if !authorized(&parts.headers, &settings) {
            return reply(StatusCode::UNAUTHORIZED, "Invalid bearer token");
        }
        settings.mode
    };
    let mut headers = std::collections::HashMap::new();
    for name in MCP_HEADERS {
        let mut values = parts.headers.get_all(name).iter();
        if let Some(value) = values.next() {
            match value.to_str() {
                Ok(value) if values.next().is_none() => {
                    headers.insert(name.to_owned(), value.to_owned());
                }
                _ => return reply(StatusCode::BAD_REQUEST, "Invalid MCP header"),
            }
        }
    }
    match state
        .bridge
        .dispatch(mode, headers, body, IPC_TIMEOUT)
        .await
    {
        Ok(response) => {
            let Ok(status) = StatusCode::from_u16(response.status) else {
                return reply(StatusCode::BAD_GATEWAY, "Invalid webview response");
            };
            let mut result = reply(status, response.body);
            if let Some(content_type) = response.content_type {
                let Ok(value) = header::HeaderValue::from_str(&content_type) else {
                    return reply(StatusCode::BAD_GATEWAY, "Invalid webview response");
                };
                result.headers_mut().insert(header::CONTENT_TYPE, value);
            }
            result
        }
        Err(bridge::Failure::Unavailable) => {
            reply(StatusCode::SERVICE_UNAVAILABLE, "MCP webview is not ready")
        }
        Err(bridge::Failure::Timeout) => {
            reply(StatusCode::GATEWAY_TIMEOUT, "MCP webview timed out")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::net::Ipv4Addr;
    use tauri::ipc::Channel;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpStream,
    };

    async fn send(
        port: u16,
        method: &str,
        path: &str,
        host: &str,
        headers: &str,
        body: &str,
    ) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {host}\r\nContent-Length: {}\r\n{headers}\r\n{body}",
            body.len()
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut reply = String::new();
        stream.read_to_string(&mut reply).await.unwrap();
        reply
    }

    #[tokio::test]
    async fn verifies_http_guards_auth_rotation_readiness_and_shutdown() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(listener.local_addr().unwrap().ip().is_loopback());
        let state = Arc::new(super::super::Shared::default());
        {
            let mut settings = state.settings.write().unwrap();
            settings.enabled = true;
            settings.token = "original-token".into();
        }
        let (shutdown, stop) = oneshot::channel();
        let task = tokio::spawn(serve(listener, state.clone(), stop));
        let host = format!("localhost:{port}");
        let auth = "Authorization: Bearer original-token\r\n";
        let post = |headers| send(port, "POST", "/mcp", &host, headers, "{}");

        assert!(post("").await.starts_with("HTTP/1.1 401"));
        assert!(
            post("Authorization: Bearer invalid\r\n")
                .await
                .starts_with("HTTP/1.1 401")
        );
        assert!(post(auth).await.starts_with("HTTP/1.1 503"));
        assert!(post("Origin: null\r\n").await.starts_with("HTTP/1.1 403"));
        assert!(
            send(port, "POST", "/mcp", "invalid.local", auth, "{}")
                .await
                .starts_with("HTTP/1.1 403")
        );
        assert!(
            send(port, "GET", "/mcp", &host, auth, "")
                .await
                .starts_with("HTTP/1.1 405")
        );
        assert!(
            send(port, "POST", "/other", &host, auth, "{}")
                .await
                .starts_with("HTTP/1.1 404")
        );
        assert!(
            send(
                port,
                "POST",
                "/mcp",
                &host,
                auth,
                &"x".repeat(MAX_BODY_BYTES + 1)
            )
            .await
            .starts_with("HTTP/1.1 413")
        );

        let weak = Arc::downgrade(&state);
        state.bridge.attach(Some(Channel::new(move |payload| {
            let request: Value = payload.deserialize().unwrap();
            assert_eq!(request["mode"], "read");
            assert_eq!(request["headers"].get("authorization"), None);
            weak.upgrade().unwrap().bridge.reply(
                request["id"].as_str().unwrap(),
                bridge::Response {
                    status: 200,
                    content_type: Some("application/json".into()),
                    body: request["body"].as_str().unwrap().into(),
                },
            );
            Ok(())
        })));
        assert!(post(auth).await.ends_with("\r\n\r\n{}"));
        state.settings.write().unwrap().token = "rotated-token".into();
        assert!(post(auth).await.starts_with("HTTP/1.1 401"));
        assert!(
            post("Authorization: Bearer rotated-token\r\n")
                .await
                .starts_with("HTTP/1.1 200")
        );
        state.settings.write().unwrap().authentication = false;
        assert!(post("").await.starts_with("HTTP/1.1 200"));

        shutdown.send(()).unwrap();
        task.await.unwrap();
        assert!(
            TcpStream::connect((Ipv4Addr::LOCALHOST, port))
                .await
                .is_err()
        );
    }
}
