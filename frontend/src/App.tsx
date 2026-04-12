// apps/dcnet_progress/frontend/src/App.tsx
import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import RunInboxPage from "./pages/RunInboxPage";
import ProcessListPage from "./pages/ProcessListPage";
import ProcessDesignerPage from "./pages/ProcessDesignerPage";
import DesignerPage from "./pages/DesignerPage";
import RunListPage from "./pages/RunListPage";
import RunDetailPage from "./pages/RunDetailPage";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Quy trình tab: inbox (pending tasks) */}
        <Route index element={<RunInboxPage />} />
        {/* Lượt chạy tab */}
        <Route path="runs" element={<RunListPage />} />
        <Route path="runs/:id" element={<RunDetailPage />} />
        {/* Thiết kế tab — new 3-panel designer */}
        <Route path="designer" element={<ProcessListPage />} />
        <Route path="designer/new" element={<DesignerPage />} />
        <Route path="designer/:id" element={<DesignerPage />} />
        {/* Legacy routes for backward compat */}
        <Route path="definitions" element={<ProcessListPage />} />
        <Route path="definitions/new" element={<ProcessDesignerPage />} />
        <Route path="definitions/:id" element={<ProcessDesignerPage />} />
        {/* Báo cáo tab */}
        <Route path="reports" element={<ReportsPage />} />
        {/* Thiết lập tab */}
        <Route path="settings" element={<SettingsPage />} />
        {/* Legacy dashboard */}
        <Route path="dashboard" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}

export default App;
