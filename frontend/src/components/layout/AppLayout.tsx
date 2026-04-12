import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu } from "antd";
import {
  CheckSquareOutlined,
  ApartmentOutlined,
  PlayCircleOutlined,
  DashboardOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;

const NAV_ITEMS = [
  { key: "/", label: "Việc của tôi", icon: <CheckSquareOutlined /> },
  { key: "/definitions", label: "Quy trình", icon: <ApartmentOutlined /> },
  { key: "/runs", label: "Lần chạy", icon: <PlayCircleOutlined /> },
  { key: "/dashboard", label: "Tổng quan", icon: <DashboardOutlined /> },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selected =
    NAV_ITEMS.find((i) => i.key !== "/" && location.pathname.startsWith(i.key))?.key ??
    "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={200} theme="light" style={{ borderRight: "1px solid #f0f0f0" }}>
        <div
          style={{
            padding: "16px",
            fontWeight: 700,
            fontSize: 16,
            color: "#1677ff",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          DCNet Quy trình
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#666" }}>Hệ thống quản lý quy trình</span>
        </Header>
        <Content style={{ padding: 24, background: "#f5f5f5" }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
