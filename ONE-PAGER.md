# ATS Job Scraper

Live job postings, taken straight from employers' own career pages and delivered as clean, structured data.

## The problem with job data

Pull a feed from any of the big job boards and you will spend more time cleaning it than using it.

The same role appears three times: once from the employer, once from an agency, once from a recruiter who is not actually hiring and just wants your CV on file. Postings sit there long after the job is filled. Apply links bounce through redirects and land on a dead page. You cannot tell which listings are real.

None of that is a scraping problem. It is what job boards are: a place where anyone can post anything, including people who are not hiring.

## A different source

Almost no company builds its own careers page. They use recruitment software, and roughly ten of those systems cover most of the market. Greenhouse, Workday, Ashby, Lever, Personio and a handful of others.

Those systems publish their openings in a machine-readable format, because that is how the careers page on the company's website gets filled in. This reads that same feed.

The result is a list of jobs that exist, at companies that are hiring, with links that go to the employer's actual application form.

## What you get

**One posting per role.** No agency copies, no recruiter reposts, no duplicates to deduplicate.

**Apply links that work.** Straight to the employer's own form.

**Closed jobs, flagged.** Every run reads a company's complete list of openings, so anything that disappeared since last time is reported separately. Most job feeds cannot do this, because they only ever see what gets added. If you run a job board, this is the difference between a site that looks current and one that looks abandoned.

**Ten systems, one format.** Each platform returns a different shape. You get a single consistent set of fields regardless of source.

**The messy parts already sorted.** Locations arrive as free text like "Remote, Italy", "München" or "NY HQ" and come back as a clean city, region and country you can filter on. Salary is extracted where the employer published it. So is whether the role is remote, hybrid or on-site, how many days a week in the office, what seniority is wanted, and what language the advert is written in.

**Optional AI summaries.** Switch it on with your own key and each job also gets the specific skills required and a short summary of responsibilities. Off by default, because most people do not need it and it costs money.

## Who it is for

Job boards that need real listings rather than aggregator noise. Recruitment tools that want to know who is hiring right now. Sales and lead generation teams who treat a new job posting as a buying signal, because a company hiring five engineers is a company with budget. Researchers and analysts tracking hiring across a market.

## What it costs to run

Very little per job, by design.

Most of what you get is read directly from the recruitment system's own data or worked out with plain pattern matching. No AI, so no per-job cost. That covers salary, location, seniority, remote status, employment type and language.

When a company has posted nothing new since the last check, the tool notices and skips downloading their page. On an hourly schedule that avoids most of the work. Job descriptions are only fetched for postings that survive your filters, so narrow searches stay cheap even against large employers.

The AI layer is off unless you turn it on, only reads jobs that are genuinely new, and remembers what it has already read so it never pays twice for the same advert.

## Proven, not estimated

Every number here comes from actual runs on 18 August 2026, not projections.

Ten platforms, each verified against a live company board. A nine-company run collects 906 jobs in 45 seconds. 179 company career pages ship ready to use, all checked and working, holding 18,830 jobs between them. 78 automated tests run against real captured data.

Across 907 real postings: employment type resolved on 60%, work arrangement on 99%, country on 97%, language on 94%, seniority on 82%, salary on 21%.

That salary figure is not a failure to extract. It is how many employers publish a number at all.

## Where the limits are

It reads ten recruitment systems, not every system in existence. Some others need a paid API key or publish nothing readable.

It ships knowing 179 company career pages. Adding a company is one line of configuration, and the list grows as you point it at the employers you care about.

It can place a job on a map about half the time. The rest get a city and country but no coordinates, because the built-in location list covers major hiring centres rather than every town.

It has no history. It knows what is on a careers page now, and what was there last time it looked.

## Getting started

Point it at a company and it works. Give it a careers page URL and it identifies the recruitment system automatically, so you do not need to know or care which one a company uses.

Run it on a schedule and it delivers only what changed since last time.
