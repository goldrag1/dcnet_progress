import { useEffect, useState } from "react";
import { Modal, Spin, Card, Row, Col, Typography, Tag, Empty, Alert } from "antd";
import { getTemplates } from "../../api/client";
import type { ProcessTemplate } from "../../api/types";

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (template: { title: string; steps_json?: string; transitions_json?: string }) => void;
}

export default function TemplatePickerModal({ open, onClose, onSelect }: Props) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getTemplates()
      .then(setTemplates)
      .catch(() => setError("Không thể tải danh sách mẫu"))
      .finally(() => setLoading(false));
  }, [open]);

  const categories = [...new Set(templates.map((t) => t.category ?? "Khác"))];

  return (
    <Modal
      title="Chọn mẫu quy trình"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      {loading && <Spin style={{ display: "block", margin: "40px auto" }} />}
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      {!loading && !error && templates.length === 0 && (
        <Empty description="Chưa có mẫu nào" />
      )}
      {!loading && categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <Text strong style={{ display: "block", marginBottom: 8, color: "#555" }}>{cat}</Text>
          <Row gutter={[12, 12]}>
            {templates.filter((t) => (t.category ?? "Khác") === cat).map((tpl) => (
              <Col span={8} key={tpl.name}>
                <Card
                  hoverable
                  size="small"
                  onClick={() => onSelect({ title: tpl.title, steps_json: tpl.steps_json, transitions_json: tpl.transitions_json })}
                  style={{ cursor: "pointer" }}
                >
                  <Text strong style={{ fontSize: 13 }}>{tpl.title}</Text>
                  {tpl.description && (
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                      {tpl.description}
                    </Text>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <Tag color="blue" style={{ fontSize: 11 }}>Dùng mẫu này</Tag>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </Modal>
  );
}
