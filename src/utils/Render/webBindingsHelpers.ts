export const sendMsgToMain = (msg: string, ...data: any[]) => {
  window.figmaApi.send(msg, ...data);
};

export const registerCallbackWithMainProcess = (() => {
  let nextCallbackID = 0;
  const registeredCallbacks = new Map();

  window.figmaApi.on("handleCallback", (callbackID: number, result: any) => {
    const registeredCallback = registeredCallbacks.get(callbackID);
    if (registeredCallback) {
      registeredCallback(result);
    } else {
      console.error("[desktop] unexpected callback", callbackID);
    }
  });

  return function (channel: string, args: any, callback: (result: any) => void) {
    const callbackID = nextCallbackID++;
    registeredCallbacks.set(callbackID, callback);

    window.figmaApi.send(`web-callback:${channel}`, callbackID, args);

    return () => {
      // TODO: this message is not handled anywhere
      window.figmaApi.send("web-cancel-callback", callbackID);
      registeredCallbacks.delete(callbackID);
    };
  };
})();
