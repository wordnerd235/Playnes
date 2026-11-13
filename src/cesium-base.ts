// Must be imported before anything touches Cesium: tells it where its workers and assets live.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;
export {};
