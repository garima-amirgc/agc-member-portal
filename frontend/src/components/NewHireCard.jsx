import SpotlightFeedCard from "./SpotlightFeedCard";
import { NEW_HIRES_FEED } from "../constants/spotlightFeedConfig";

export default function NewHireCard(props) {
  return <SpotlightFeedCard feed={NEW_HIRES_FEED} {...props} />;
}
