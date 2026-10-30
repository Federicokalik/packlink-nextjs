# GitHub Actions

1. Copy [`packlink-sync.yml`](./packlink-sync.yml) to `.github/workflows/` in a
   repository you own (it does not have to be the app's repository).
2. Add two repository secrets under **Settings → Secrets and variables → Actions**:
   `PACKLINK_SYNC_URL` and `PACKLINK_SYNC_CRON_SECRET`.
3. Run it once by hand from the **Actions** tab (`workflow_dispatch`) to check it.

Things to know about scheduled workflows:

- the shortest interval is 5 minutes, and runs often start several minutes late
  when GitHub is busy — fine for parcel tracking;
- in public repositories, schedules are disabled after 60 days without
  activity on the repository: GitHub emails you before it happens;
- they run on the default branch only.
