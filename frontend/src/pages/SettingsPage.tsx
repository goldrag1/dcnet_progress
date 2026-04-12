import { Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function SettingsPage() {
  return (
    <Card>
      <Title level={4}>Thiết lập</Title>
      <Paragraph type="secondary">
        Cấu hình hệ thống quy trình: quyền truy cập, thông báo, mẫu quy trình.
      </Paragraph>
      <Paragraph type="secondary">Tính năng đang phát triển.</Paragraph>
    </Card>
  );
}
