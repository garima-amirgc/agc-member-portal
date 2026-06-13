import SpotlightFeedArchivePage from "./SpotlightFeedArchivePage";
import { CUSTOMER_WINS_FEED } from "../constants/spotlightFeedConfig";

export default function CustomerWinsPage() {
  return <SpotlightFeedArchivePage feed={CUSTOMER_WINS_FEED} />;
}
