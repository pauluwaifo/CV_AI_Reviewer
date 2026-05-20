declare global {
  var pdfjsWorker:
    | {
        WorkerMessageHandler?: unknown;
      }
    | undefined;
}

export {};
