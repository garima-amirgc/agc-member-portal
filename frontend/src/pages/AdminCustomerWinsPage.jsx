import AdminSpotlightFeedPage from "./AdminSpotlightFeedPage";
import { CUSTOMER_WINS_FEED } from "../constants/spotlightFeedConfig";

export default function AdminCustomerWinsPage() {
  return <AdminSpotlightFeedPage feed={CUSTOMER_WINS_FEED} />;
}
