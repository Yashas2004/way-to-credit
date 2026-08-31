import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HealthCheck } from "./routes/HealthCheck";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HealthCheck />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
