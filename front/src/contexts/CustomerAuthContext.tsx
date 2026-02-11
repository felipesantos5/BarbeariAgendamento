import { createContext, useState, useContext, useEffect, ReactNode } from "react";
import apiClient from "@/services/api"; // Reutilizando seu apiClient

// Tipagem para os dados do cliente que salvaremos
interface Customer {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  birthDate?: string;
}

interface CustomerAuthContextType {
  token: string | null;
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, customerData: Customer) => void;
  logout: () => void;
  updateCustomerData: (data: Partial<Customer>) => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export const CustomerAuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem("customerToken"));
  const [customer, setCustomer] = useState<Customer | null>(JSON.parse(localStorage.getItem("customerUser") || "null"));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Adiciona o token ao cabeçalho de todas as requisições da API se ele existir
    if (token) {
      apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }
    setIsLoading(false);
  }, [token]);

  const login = (newToken: string, customerData: Customer) => {
    localStorage.setItem("customerToken", newToken);
    localStorage.setItem("customerUser", JSON.stringify(customerData));
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    setToken(newToken);
    setCustomer(customerData);
  };

  const logout = () => {
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customerUser");
    delete apiClient.defaults.headers.common["Authorization"];
    setToken(null);
    setCustomer(null);
  };

  const updateCustomerData = (data: Partial<Customer>) => {
    if (customer) {
      const updated = { ...customer, ...data };
      setCustomer(updated);
      localStorage.setItem("customerUser", JSON.stringify(updated));
    }
  };

  return (
    <CustomerAuthContext.Provider value={{ token, customer, isAuthenticated: !!token, isLoading, login, logout, updateCustomerData }}>
      {children}
    </CustomerAuthContext.Provider>
  );
};

export const useCustomerAuth = () => {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return context;
};
