import { bootstrapApplication } from '@angular/platform-browser';
async function start(): Promise<void> {
  const component = new URLSearchParams(window.location.search).has('pdfViewer')
    ? (await import('./app/pdf/pdf-viewer.component')).PdfViewerComponent
    : (await import('./app/app.component')).AppComponent;
  await bootstrapApplication(component);
}
void start().catch(console.error);
