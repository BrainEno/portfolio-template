import AdminApp from "../portfolio/admin/AdminApp";
import "../portfolio/styles/admin.css";

export const meta = () => [{ title: "Studio — Portfolio admin" }, { name: "robots", content: "noindex, nofollow" }];

export default function Admin() {
  return <AdminApp />;
}
