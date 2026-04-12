// apps/dcnet_progress/frontend/src/App.tsx
import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import MyTasksPage from "./pages/MyTasksPage";
import ProcessListPage from "./pages/ProcessListPage";
import ProcessDesignerPage from "./pages/ProcessDesignerPage";
import RunListPage from "./pages/RunListPage";
import RunDetailPage from "./pages/RunDetailPage";
import DashboardPage from "./pages/DashboardPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<MyTasksPage />} />
        <Route path="definitions" element={<ProcessListPage />} />
        <Route path="definitions/new" element={<ProcessDesignerPage />} />
        <Route path="definitions/:id" element={<ProcessDesignerPage />} />
        <Route path="runs" element={<RunListPage />} />
        <Route path="runs/:id" element={<RunDetailPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}

export default App;
