// Identifies THIS deployment among the demo sites that share one Supabase
// project. Used to scope the spend cap and analytics to this site so a busy
// sibling demo can't trip our daily cap or pollute our /admin stats. Override
// per deploy with the SITE_ID env var; defaults to 'rolodex'.
export const SITE_ID = process.env.SITE_ID || 'rolodex';
