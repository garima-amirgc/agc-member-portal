import SpotlightFeedCard from "./SpotlightFeedCard";
import { CUSTOMER_WINS_FEED } from "../constants/spotlightFeedConfig";

export default function CustomerWinCard(props) {
  return <SpotlightFeedCard feed={CUSTOMER_WINS_FEED} {...props} />;
}
