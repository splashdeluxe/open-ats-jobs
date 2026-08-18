# Open ATS Jobs

A tool that collects job adverts directly from company career pages and hands them back as clean, structured data.

## The problem it solves

If you want a live feed of job adverts, you have two options today, and neither is good.

You can scrape job boards like Indeed or LinkedIn. The listings there are often stale, duplicated across a dozen agencies, or reposted by recruiters who are not actually hiring. You end up cleaning more than you collect.

Or you can buy the data. There are companies that sell exactly this, and they work well. The one this was modelled on charges between $4 and $12 per thousand adverts, and it sells you access to a database they own. You are renting their data, and the price scales with how much you use.

This takes the third path. It goes to the source: the careers page on the company's own website, where the employer posted the job themselves.

## What it actually does

Most companies do not build their own careers page. They use recruitment software, and about ten of those systems account for a large share of the market. Greenhouse, Workday, Personio and the rest.

Those systems publish their job listings in a machine-readable format, because that is how the careers page on the company's website gets filled in. This tool reads that same feed. Nothing is bypassed and nothing is guessed at.

It then does the boring, valuable part: taking ten different formats and turning them into one. Every advert comes back with the same fields in the same shape, whichever system it came from.

## What you get for each job

The title, the company, and a direct link to apply on the employer's own site.

Where the job is, cleaned up. "Remote, Italy" and "München" and "NYC HQ" arrive as messy text and come back as a city, a region, and a country you can actually filter on.

Whether it is remote, hybrid or on-site, and how many days a week in the office if the advert says.

Salary, when the employer published one. Roughly a fifth of adverts do.

Whether it is full-time, a contract or an internship. Roughly what level of experience is wanted. What language the advert is written in. What field of work it belongs to.

Optionally, and only if you switch it on and supply your own key, a short AI-written summary of the responsibilities and requirements, plus the specific skills asked for.

## What it costs to run

Almost nothing per job, because most of the work is not expensive.

The bulk of what you get is read straight out of the recruitment system's own data or worked out with plain pattern matching. No AI involved, so no per-job cost. That covers salary, location, seniority, remote status, employment type and language.

The AI part is switched off by default. When you do turn it on, it only runs on jobs that are genuinely new, it only reads the three things that need actual comprehension, and it remembers what it has already read so it never pays twice for the same advert.

If a company has not posted anything new since the last check, the tool notices and skips downloading their page entirely. On an hourly schedule that is most checks avoided.

## Where it beats paying for the data

You find out when a job is taken down. Because every run reads a company's complete list, anything that vanished since last time is obvious. The commercial service this was modelled on sells that as a separate product at $20 a month. Here it falls out of how the thing works, at no extra cost.

And you own what you collect. There is no per-job charge on data you gathered yourself.

## Where it is currently weak

It reads ten recruitment systems. The commercial alternative reads over fifty. That gap is real, and closing it is slow work: several of the remaining systems require a paid API key or publish nothing readable, so they cannot simply be added.

It knows about 179 company career pages out of the box, all checked and working. The commercial service knows about 175,000. Their number is the product of years of collecting; ours grows each time you point the tool at a new company.

It can place a job on a map about half the time. The other half get a city and country but no coordinates, because the built-in location list covers major hiring cities rather than every town.

There is no history. It knows what is on a careers page now and what was there last time it looked. It cannot tell you what was advertised last March unless it was already running last March.

## Honest summary

If you need every job in a market from day one, buy the data. That is what the commercial services are for and they are good at it.

If you want a feed you control, from a set of employers you care about, with no per-job fee and no vendor between you and the source, this does that. It runs today across ten recruitment systems and 179 verified company career pages, and adding another company is one line of configuration.

---

*Checked against live career pages on 18 August 2026. All figures in this document come from actual runs, not estimates.*
