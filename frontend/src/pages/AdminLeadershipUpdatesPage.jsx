import AdminSpotlightFeedPage from "./AdminSpotlightFeedPage";
import { LEADERSHIP_FEED } from "../constants/spotlightFeedConfig";

export default function AdminLeadershipUpdatesPage() {
  return <AdminSpotlightFeedPage feed={LEADERSHIP_FEED} />;
}
