import { useState, useEffect } from "react";
import { Layout, Menu, Badge, List, Tag, Typography, Spin, Empty } from "antd";
import { useNavigate } from "react-router-dom";
import { getMyTasks, getRunList, getSavedFilters } from "../api/client";
import type { MyTask, ProcessRun, ProcessSavedFilter } from "../api/types";

const { Sider, Content } = Layout;
const { Text } = Typography;

type InboxTab = "pending" | "done" | "draft" | "all" | string;

export default function RunInboxPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<InboxTab>("pending");
  const [pendingTasks, setPendingTasks] = useState<MyTask[]>([]);
  const [runs, setRuns] = useState<ProcessRun[]>([]);
  const [savedFilters, setSavedFilters] = useState<ProcessSavedFilter[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === "pending") {
        const res = await getMyTasks({ page_size: 50 });
        setPendingTasks(res.data);
      } else if (activeTab === "done") {
        const res = await getRunList({ status: "Completed", page_size: 50 });
        setRuns(res.data);
      } else if (activeTab === "draft") {
        const res = await getRunList({ is_draft: 1, page_size: 50 });
        setRuns(res.data);
      } else if (activeTab === "all") {
        const res = await getRunList({ page_size: 50 });
        setRuns(res.data);
      }
      const filters = await getSavedFilters();
      setSavedFilters(filters);
    } catch (_e) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  }

  const menuItems = [
    {
      key: "pending",
      label: (
        <span>
          Cần thực hiện{" "}
          {pendingTasks.length > 0 && (
            <Badge count={pendingTasks.length} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
    },
    { key: "done", label: "Đã thực hiện" },
    { key: "draft", label: "Nháp" },
    { key: "all", label: "Tất cả" },
    { type: "divider" as const },
    ...savedFilters.map((f) => ({ key: `filter:${f.name}`, label: f.filter_name })),
  ];

  function renderContent() {
    if (loading) return <Spin style={{ display: "block", margin: "48px auto" }} />;

    if (activeTab === "pending") {
      if (pendingTasks.length === 0) return <Empty description="Không có việc cần thực hiện" />;
      return (
        <List
          dataSource={pendingTasks}
          renderItem={(task) => (
            <List.Item
              style={{ cursor: "pointer", background: "#fff", padding: "12px 16px", borderRadius: 6, marginBottom: 8 }}
              onClick={() => navigate(`/runs/${task.run}`)}
            >
              <List.Item.Meta
                title={<Text strong>{task.run_title}</Text>}
                description={
                  <span>
                    <Tag color="blue">{task.definition_title}</Tag>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      {task.label}
                    </Text>
                  </span>
                }
              />
              {task.deadline_at && (
                <Tag color="red">Hạn: {new Date(task.deadline_at).toLocaleDateString("vi-VN")}</Tag>
              )}
            </List.Item>
          )}
        />
      );
    }

    if (runs.length === 0) return <Empty description="Không có dữ liệu" />;
    return (
      <List
        dataSource={runs}
        renderItem={(run) => (
          <List.Item
            style={{ cursor: "pointer", background: "#fff", padding: "12px 16px", borderRadius: 6, marginBottom: 8 }}
            onClick={() => navigate(`/runs/${run.name}`)}
          >
            <List.Item.Meta
              title={<Text strong>{run.title}</Text>}
              description={<Tag color="blue">{run.definition_title}</Tag>}
            />
            <Tag
              color={
                run.status === "Completed"
                  ? "green"
                  : run.status === "Running"
                  ? "blue"
                  : run.status === "Draft"
                  ? "default"
                  : "red"
              }
            >
              {run.status === "Running"
                ? "Đang chạy"
                : run.status === "Completed"
                ? "Hoàn thành"
                : run.status === "Draft"
                ? "Nháp"
                : run.status === "Cancelled"
                ? "Đã hủy"
                : "Từ chối"}
            </Tag>
          </List.Item>
        )}
      />
    );
  }

  return (
    <Layout style={{ background: "transparent" }}>
      <Sider width={200} style={{ background: "#fff", borderRadius: 8, marginRight: 16 }}>
        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          onClick={({ key }) => setActiveTab(key)}
          style={{ border: "none" }}
        />
      </Sider>
      <Content>{renderContent()}</Content>
    </Layout>
  );
}
