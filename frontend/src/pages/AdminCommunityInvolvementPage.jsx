import AdminSpotlightFeedPage from "./AdminSpotlightFeedPage";
import { COMMUNITY_INVOLVEMENT_FEED } from "../constants/spotlightFeedConfig";

export default function AdminCommunityInvolvementPage() {
  return <AdminSpotlightFeedPage feed={COMMUNITY_INVOLVEMENT_FEED} />;
}
