# Estimated free-tier limits

**Checked:** 2026-11-22. Provider limits and terms change; confirm them in each account before launch. These allowances are independent, may be shared across an organization/account, and do not guarantee that pixzer remains free.

| Service                | Current published free allowance                                                                                                                                                      | pixzer impact                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare R2 Standard | 10 GB-month storage, 1 million Class A requests/month, 10 million Class B requests/month; internet egress listed as free                                                              | Ten 900 MB account quotas total 9 GB, leaving roughly 1 GB operational headroom before temporary upload copies, saves, or other account use. Enforce a global ceiling and monitor operations.                                                 |
| Supabase Free          | 500 MB database/project, 50,000 monthly active users, 5 GB uncached + 5 GB cached egress; free projects pause after one week inactivity; up to two active projects                    | Metadata volume should be modest for ten users, but the project can pause during quiet periods and has no included automatic backups. Establish a tested backup/export plan before relying on it. R2, not Supabase Storage, holds game bytes. |
| Vercel Hobby           | Free plan aimed at personal, non-commercial use; published limits include 1 million function invocations and 100 GB-hours function duration, with 10-second default function duration | Suitable only if the project's purpose and account terms fit Hobby's personal-use restriction. Review current fair-use/acceptable-use terms and resource limits before inviting users or charging for access.                                 |

The estimates exclude domain registration, email delivery, monitoring, malware scanning, support, backups beyond included allowances, emulator asset hosting, and excess usage. EmulatorJS and its cores have independent licensing and distribution obligations. A service can pause, throttle, or require an upgrade even when storage remains within quota.

## Controls before launch

- Set both the per-user 900 MB ceiling and a global committed-plus-reserved-byte ceiling with an explicit shared reserve.
- Set provider usage alerts and review actual R2 storage and operation counts, Supabase egress/database size, and Vercel function usage.
- Confirm that invited-user use is permitted by the selected hosting plan; move to a paid plan if the usage model requires it.
- Decide how PostgreSQL backups and account recovery work; Supabase Free does not include automatic backups.
- Recheck pricing and terms at launch and on a recurring schedule. Never promise zero cost.

## Official references

- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Supabase pricing](https://supabase.com/pricing/)
- [Supabase bandwidth and storage egress](https://supabase.com/docs/guides/storage/serving/bandwidth)
- [Supabase database-only cost and Free plan pause behavior](https://supabase.com/kb/faqs/platform/database-only-cost)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel platform limits](https://vercel.com/docs/limits)
