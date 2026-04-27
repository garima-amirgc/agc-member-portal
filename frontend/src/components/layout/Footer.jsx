import { APP_DISPLAY_NAME } from "../../constants/branding";
import { PAGE_GUTTER_X } from "../../constants/pageLayout";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="agc-footer-reserved relative">
      <div className="agc-footer-reserved-bar" aria-hidden />

      <div className={`agc-footer-reserved-inner ${PAGE_GUTTER_X} text-[#0a0a0a] dark:text-white`}>
        © {year}{" "}
        <span className="agc-footer-brand">{APP_DISPLAY_NAME}</span>
        <span className="agc-footer-dot" aria-hidden>
          ·
        </span>
        All rights reserved.
      </div>
    </footer>
  );
}
