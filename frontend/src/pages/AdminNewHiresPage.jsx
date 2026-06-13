import AdminSpotlightFeedPage from "./AdminSpotlightFeedPage";
import { NEW_HIRES_FEED } from "../constants/spotlightFeedConfig";

export default function AdminNewHiresPage() {
  return <AdminSpotlightFeedPage feed={NEW_HIRES_FEED} />;
}
