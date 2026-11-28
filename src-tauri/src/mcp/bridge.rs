use super::settings::AccessMode;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::ipc::Channel;
use tokio::sync::oneshot;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Request {
    pub(super) id: String,
    pub(super) mode: AccessMode,
    pub(super) headers: HashMap<String, String>,
    pub(super) body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Response {
    pub(super) status: u16,
    pub(super) content_type: Option<String>,
    pub(super) body: String,
}

#[derive(Default)]
pub(super) struct Bridge(Mutex<State>);

#[derive(Default)]
struct State {
    channel: Option<Channel<Request>>,
    next_id: u64,
    pending: HashMap<String, oneshot::Sender<Response>>,
}

pub(super) enum Failure {
    Unavailable,
    Timeout,
}

struct Pending<'a> {
    bridge: &'a Bridge,
    id: String,
}

impl Drop for Pending<'_> {
    fn drop(&mut self) {
        self.bridge.0.lock().unwrap().pending.remove(&self.id);
    }
}

impl Bridge {
    pub(super) fn attach(&self, channel: Option<Channel<Request>>) {
        let mut state = self.0.lock().unwrap();
        state.pending.clear();
        state.channel = channel;
    }

    pub(super) fn reply(&self, id: &str, response: Response) {
        if let Some(sender) = self.0.lock().unwrap().pending.remove(id) {
            let _ = sender.send(response);
        }
    }

    pub(super) async fn dispatch(
        &self,
        mode: AccessMode,
        headers: HashMap<String, String>,
        body: String,
        timeout: Duration,
    ) -> Result<Response, Failure> {
        let (sender, receiver) = oneshot::channel();
        let (id, channel) = {
            let mut state = self.0.lock().unwrap();
            let channel = state.channel.clone().ok_or(Failure::Unavailable)?;
            state.next_id += 1;
            let id = state.next_id.to_string();
            state.pending.insert(id.clone(), sender);
            (id, channel)
        };
        let _pending = Pending {
            bridge: self,
            id: id.clone(),
        };
        channel
            .send(Request {
                id,
                mode,
                headers,
                body,
            })
            .map_err(|_| Failure::Unavailable)?;
        tokio::time::timeout(timeout, receiver)
            .await
            .map_err(|_| Failure::Timeout)?
            .map_err(|_| Failure::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tokio::sync::mpsc;

    async fn dispatch(bridge: &Bridge, body: &str, timeout: Duration) -> Result<Response, Failure> {
        bridge
            .dispatch(AccessMode::ReadWrite, HashMap::new(), body.into(), timeout)
            .await
    }

    #[tokio::test]
    async fn replies_are_correlated_even_when_completed_in_reverse_order() {
        let bridge = Bridge::default();
        let (tx, mut rx) = mpsc::unbounded_channel();
        bridge.attach(Some(Channel::new(move |data| {
            tx.send(data.deserialize::<Value>().unwrap()).unwrap();
            Ok(())
        })));
        let timeout = Duration::from_secs(1);
        let (first, second, ()) = tokio::join!(
            dispatch(&bridge, "first", timeout),
            dispatch(&bridge, "second", timeout),
            async {
                let first = rx.recv().await.unwrap();
                let second = rx.recv().await.unwrap();
                for request in [second, first] {
                    assert_eq!(request["mode"], "readWrite");
                    bridge.reply(
                        request["id"].as_str().unwrap(),
                        Response {
                            status: 200,
                            content_type: None,
                            body: request["body"].as_str().unwrap().to_owned(),
                        },
                    );
                }
            },
        );
        assert_eq!(first.ok().unwrap().body, "first");
        assert_eq!(second.ok().unwrap().body, "second");
    }

    #[tokio::test]
    async fn timeout_and_detach_release_pending_requests() {
        let bridge = Bridge::default();
        let timeout = Duration::from_millis(1);
        assert!(matches!(
            dispatch(&bridge, "", timeout).await,
            Err(Failure::Unavailable)
        ));

        bridge.attach(Some(Channel::new(|_| Ok(()))));
        assert!(matches!(
            dispatch(&bridge, "", timeout).await,
            Err(Failure::Timeout)
        ));
        assert!(bridge.0.lock().unwrap().pending.is_empty());

        let (result, ()) = tokio::join!(dispatch(&bridge, "", Duration::from_secs(1)), async {
            bridge.attach(None)
        },);
        assert!(matches!(result, Err(Failure::Unavailable)));
        assert!(bridge.0.lock().unwrap().pending.is_empty());
    }
}
