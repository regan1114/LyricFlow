// The static build runs entirely in the browser; regular builds use the local Python API.
export const autoRecognitionEnabled = import.meta.env.MODE !== 'static';
