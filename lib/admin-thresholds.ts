/**
 * Centrálne prahy pre admin dashboard (/admin/prehlad).
 * Uprav tu — nie na desiatych miestach v UI.
 */

/** Počet neobvolaných leadov (>24h) po ktorom kartička zčervená. */
export const UNCALLED_ALERT_THRESHOLD = 20;

/** Počet dní, po ktorých je položka v pipeline označená ako stagnujúca. */
export const STAGNATION_DAYS = 5;

/** Prah pre výpadok leadov per zdroj — minúty. */
export const LEAD_GAP_MINUTES = 30;

/**
 * Rola považovaná za neaktívnu, keď posledná akcia je staršia než X dní.
 * Zvýrazní sa v role-activity tile.
 */
export const ROLE_INACTIVE_DAYS = 3;
