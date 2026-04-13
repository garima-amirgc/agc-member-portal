import { PAGE_GUTTER_X } from "../../constants/pageLayout";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="agc-footer-reserved">
      <div className="agc-footer-reserved-bar" aria-hidden />
      <div className={`agc-footer-reserved-inner ${PAGE_GUTTER_X}`}>
        © {year}{" "}
        <span className="agc-footer-brand">AGC University</span>
        <span className="agc-footer-dot" aria-hidden>
          ·
        </span>
        All rights reserved.
      </div>
    </footer>
  );
}
