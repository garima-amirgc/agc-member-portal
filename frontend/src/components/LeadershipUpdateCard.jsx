import SpotlightFeedCard from "./SpotlightFeedCard";
import { LEADERSHIP_FEED } from "../constants/spotlightFeedConfig";

export default function LeadershipUpdateCard(props) {
  return <SpotlightFeedCard feed={LEADERSHIP_FEED} {...props} />;
}
