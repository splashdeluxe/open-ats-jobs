# ATS Job Scraper

Live job postings, taken straight from employers' own career pages and delivered as clean, structured data.

## The problem with job data

Pull a feed from any of the big job boards and you will spend more time cleaning it than using it.

The same role turns up three times: once from the employer, once from an agency, once from a recruiter who is not hiring at all and just wants your CV on file. Filled jobs sit there for months. Apply links bounce through redirects and land on a dead page.

None of that is a scraping problem. It is what job boards are, and no amount of better scraping fixes it. A place where anyone can post anything will contain a lot of anything.

## A different source

Almost no company builds its own careers page. They use recruitment software, and about ten of those systems cover most of the market: Greenhouse, Workday, Ashby, Lever, Personio and a handful of others.

Those systems publish their openings in a machine-readable format, because that is how the careers page on the company's own website gets filled in. This reads that same feed. Nothing is bypassed and nothing is guessed at.

What comes back is a list of jobs that exist, at companies that are hiring, with links that go to the employer's actual application form.

## What you get

One posting per role, from the company doing the hiring. No agency copies, no recruiter reposts, nothing to deduplicate.

Ten recruitment systems, one set of fields. Each platform returns a different shape; you never see that.

The awkward parts arrive already sorted. Locations come in as free text like "Remote, Italy", "München" or "NY HQ" and come back as a city, a region and a country you can filter on. Salary is pulled out where the employer published one. So is remote or hybrid or on-site, how many days a week in the office, roughly what seniority is wanted, and which language the advert is written in.

**Closed jobs get flagged, and this is the part most people underestimate.** Every run reads a company's complete list of openings, so anything that vanished since last time is reported separately. Most job feeds cannot do this at all, because they only ever see what gets added. If you run a job board, it is the difference between a site that looks current and one that looks abandoned.

There is an optional AI layer for skills and a short summary of responsibilities. It is off unless you switch it on and supply your own key, because most people do not need it and it costs money.

## Who buys this

Job boards, mostly, and for the obvious reason: their whole product is whether the listings are real.

Recruitment tools use it to see who is hiring this week rather than last quarter. Researchers track hiring across a market.

The one that surprises people is sales. A company posting five engineering roles has budget, a roadmap and a problem it is trying to solve, and it has told you all three in public. Job postings are one of the cleanest buying signals there is, and almost nobody treats them that way.

## What it costs to run

Very little per job, and that is a design decision rather than a happy accident.

Almost everything you get is read straight out of the recruitment system's own data or worked out with plain pattern matching. No AI involved, so no per-job cost. That covers salary, location, seniority, remote status, employment type and language.

The rest is avoiding pointless work. If a company has posted nothing since the last check, the tool notices and does not download their page at all, which on an hourly schedule skips most of the work. Job descriptions are only fetched for postings that survive your filters, so a narrow search stays cheap even against an employer with seven hundred openings.

The AI layer, when on, only reads genuinely new jobs and remembers what it has already read, so it does not pay twice for the same advert.

## The numbers

All measured on 18 August 2026, from real runs.

Ten platforms, each checked against a live company board. A nine-company run collects 906 jobs in 45 seconds. 179 career pages ship ready to use, holding 18,830 jobs between them. 78 automated tests run against captured real-world data.

Across 907 postings: work arrangement resolved on 99%, country 97%, language 94%, seniority 82%, employment type 60%, salary 21%.

That last figure looks weak until you think about it. It is not a failure to extract salary. It is how many employers publish one.

## Where the limits are

Ten recruitment systems is not every recruitment system. Some of the others want a paid API key, and a few publish nothing readable at all.

It ships knowing 179 career pages. That list grows as you point it at the employers you care about, and adding one is a single line of configuration.

It can put a job on a map about half the time. The rest get a city and country but no coordinates, because the built-in location table covers major hiring centres rather than every town.

And it has no memory of the past. It knows what is on a careers page now and what was there last time it looked, which is enough for a live feed and no use at all for historical analysis.

## Getting started

Point it at a company. Give it a careers page URL and it works out which recruitment system that company uses, so you never have to know or care.

Put it on a schedule and it sends you only what changed.
