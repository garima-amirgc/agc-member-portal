import SpotlightFeedCard from "./SpotlightFeedCard";
import { COMMUNITY_INVOLVEMENT_FEED } from "../constants/spotlightFeedConfig";

export default function CommunityInvolvementCard(props) {
  return <SpotlightFeedCard feed={COMMUNITY_INVOLVEMENT_FEED} {...props} />;
}
