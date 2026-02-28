/**
 * Minimal branding footer.
 */
export function Footer() {
    return (
        <footer className="footer">
            <div className="footer__content">
                <div className="footer__brand">
                    <span className="footer__logo">BAMPL</span>
                    <span className="footer__tagline">Elastic Supply on Bitcoin</span>
                </div>
                <div className="footer__links">
                    <span className="footer__built">
                        Built on <strong>OPNet</strong> &mdash; Bitcoin Layer 1
                    </span>
                </div>
            </div>
        </footer>
    );
}
