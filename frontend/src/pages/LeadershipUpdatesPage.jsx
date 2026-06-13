import SpotlightFeedArchivePage from "./SpotlightFeedArchivePage";
import { LEADERSHIP_FEED } from "../constants/spotlightFeedConfig";

export default function LeadershipUpdatesPage() {
  return <SpotlightFeedArchivePage feed={LEADERSHIP_FEED} />;
}
