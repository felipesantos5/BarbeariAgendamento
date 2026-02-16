import { API_BASE_URL } from "@/config/BackendUrl";
import axios from "axios";

const superAdminApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Interceptor para adicionar o token JWT a todas as requisições
superAdminApiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("superAdminToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

superAdminApiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Verifica se o erro é uma resposta da API com status 401
    if (error.response && error.response.status === 401) {
      console.log("Token de Super Admin expirado ou inválido. Deslogando...");

      // Limpa os dados de autenticação do armazenamento local
      localStorage.removeItem("superAdminToken");

      // Redireciona o usuário para a página de login do super admin.
      if (window.location.pathname.startsWith("/superadmin") && window.location.pathname !== "/superadmin/login") {
        window.location.assign("/superadmin/login");
      }
    }

    return Promise.reject(error);
  }
);

export default superAdminApiClient;
