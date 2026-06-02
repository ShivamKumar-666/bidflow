import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isGet = config && config.method && config.method.toLowerCase() === "get";
    const isTransientError = !response || (response.status >= 500 && response.status <= 504);

    if (isGet && isTransientError) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < 3) {
        config.__retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
