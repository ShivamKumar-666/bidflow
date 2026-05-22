import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatic retry for transient errors on GET requests to handle single-threaded server blocking or reloads
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    
    // Only retry GET requests that failed due to network errors (no response) or 5xx server issues
    const isGet = config && config.method && config.method.toLowerCase() === 'get';
    const isTransientError = !response || (response.status >= 500 && response.status <= 504);
    
    if (isGet && isTransientError) {
      config.__retryCount = config.__retryCount || 0;
      
      if (config.__retryCount < 3) {
        config.__retryCount += 1;
        // Wait 500ms before retrying to let server recover/process queued tasks
        await new Promise(resolve => setTimeout(resolve, 500));
        return api(config);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
