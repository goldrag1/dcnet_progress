import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Tabs, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useState } from "react";
import StartRunModal from "../run/StartRunModal";

const { Header, Content } = Layout;

const TAB_ITEMS = [
  { key: "/", label: "Quy trình" },
  { key: "/runs", label: "Lượt chạy" },
  { key: "/designer", label: "Thiết kế" },
  { key: "/reports", label: "Báo cáo" },
  { key: "/settings", label: "Thiết lập" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [startModalOpen, setStartModalOpen] = useState(false);

  // Determine active tab key based on current path
  const activeKey =
    TAB_ITEMS.slice()
      .reverse()
      .find((t) => t.key !== "/" && location.pathname.startsWith(t.key))?.key ??
    "/";

  return (
    <Layout style={{ minHeight: "100vh", background: "#fff" }}>
      <Header
        style={{
          background: "#fff",
          padding: "0 24px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "auto",
        }}
      >
        {/* Logo + app name */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#1677ff",
              whiteSpace: "nowrap",
            }}
          >
            DCNet Quy trình
          </span>
        </div>

        {/* Top tab bar */}
        <Tabs
          activeKey={activeKey}
          items={TAB_ITEMS}
          onChange={(key) => navigate(key)}
          style={{ marginBottom: 0, flex: 1, marginLeft: 24 }}
          tabBarStyle={{ marginBottom: 0, borderBottom: "none" }}
        />

        {/* Chạy quy trình button — always visible */}
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setStartModalOpen(true)}
          style={{ flexShrink: 0, marginLeft: 16 }}
        >
          Chạy quy trình
        </Button>
      </Header>

      <Content style={{ padding: 24, background: "#f5f5f5", minHeight: "calc(100vh - 48px)" }}>
        <Outlet />
      </Content>

      <StartRunModal
        open={startModalOpen}
        onClose={() => setStartModalOpen(false)}
        onStarted={(run) => {
          setStartModalOpen(false);
          navigate(`/runs/${run.name}`);
        }}
      />
    </Layout>
  );
}
