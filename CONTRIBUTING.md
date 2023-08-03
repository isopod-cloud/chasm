# Contributing

Note that the canonical home of development project for this project is GitLab - if you're reading this on GitHub, you should start by heading over to [GitLab](**TODO**:Here!).

## Welcome

Thanks for looking at contributing to Chasm! We really appreciate anything that you as a member of the open-source community have to offer, from bug reports to bug fixes, documentation improvements to feature requests.

## Our Values

As you look to contribute here, please bear in mind our values, the 5 S's, and hold us accountable to them as well.

- **Supportive**: Be understanding and encouraging of your teammates regardless of their identity. Give others the benefit of the doubt, solve the problem _and_ build the relationship. Be kind, considerate, polite, and helpful.
- **Sincere**: Be honest with yourself, your colleages, and your customers. Provide feedback when things are bad and when they're good, raise issues with the people who are able to help with them. Be open, respectful, and compassionate.
- **Studious**: Be serious and accountable for your work. Invest in understanding the problem. Communicate your intent, and execute deliberately. Commit to the result you want, and own the outcome.
- **Striving**: Always work to improve. Recognize when there is room for improvement, and develop the skills to better the situation. Look for the positive outcome, and work together towards it with the right attitude.
- **Stateless**: Be adaptable. Be open minded, and willing to try new things. Be willing to iterate, and comfortable with getting started when things are still ambiguous. Be informed and passionate, but flexible - strong opinions, weakly held.

## I just have a question!

Great! We'll do our best to answer - hop into our [Questions channel](**TODO**:Here!) and ask away.

## Reporting an Issue

There are a few types of issues you can file here:

- `bug`: Something doesn't work the way it should? That's probably a bug. Please include a careful, step-by-step guide to reproducing the bug, if possible. If reproducing the bug is hard to do without access to your environment (Chasm interacts poorly with some of your existing infrastructure, for instance), leave a note to that effect and we'll try to reach out for a private and secure conversation. If you have a security-sensitive ticket that you don't want to file publicly, please email security@isopod.cloud _instead_ of opening a ticket.
- `enhancement`: Also known as Feature Requests, Enhancement tickets are for when you have something in mind that Chasm does not do but that you would like it to. If you're filing one of these, please do bear in mind that while we love to see what the community is using Chasm for and want it to be the best tool for that job, we can't always take on every enhancement immediately. We'll do our best to convey when and how we might pick this ticket up, but the best way to get a feature added to Chasm will always be to implement it!
- `question`: If you'd rather not jump into the Questions channel, you can always ask here too! We'll do our best to answer here as well, but you'll likely get a faster response in the Questions channel.
- `feedback`: Not quite a feature request or a bug, but not really a question either? Feel free to leave general feedback here. We don't guarantee we'll act on all feedback, but we'll certainly read it!

## Writing Code

If you've got a pet peeve you want fixed, or a great idea for something to improve, here's your best bet for fixing it! We recommend you file a ticket according to [reporting an issue](#reporting-an-issue) above so there's a record of exactly what you're looking to fix, but once that's done we follow a fairly standard fork -> merge request model for community contributions.

### Where to find bugs to pick up (“good first ticket” label, or similar)

If you just want to get your feet wet in Chasm, check out our `good-first-ticket` label - these are issues that we think make a good entrypoint into the project.

### The process

Once you're ready to start, here are the steps to follow:

1. Fork the repo into your own namespace.
2. Make a branch for your work. We recommend using the Gitlab "Open Merge Request" button (**TODO**: Are we actually using gitlab issues for this? Can non-project contributors do this?) to automatically name your branch `${ISSUE_NUMBER}-${description-of-issue}`, but you can do so manually if you prefer. (**TODO**: do we?)
3. Fill out the merge request template according to the steps in it - we're not ultra strict here, but it helps make our review process smoother.
4. Once you're ready for review, remove the `Draft:` prefix from the title and wait for someone to pick the review up. We try to get eyes on all merge requests within 48 hours. (**TODO**: do we?)

#### What to expect from our code reviews

We try to review in accordance with [our values](#our-values). In this context, that should mean that we are polite and respectful, but strict about the details. Our CI pipeline should catch most style issues, so we're not gonna nitpick on those, but expect us to keep an eye on correctness and test coverage, and probably to mention a couple personal taste things that don't necessarily warrant action. If we leave a comment and immediately resolve it, that comment is personal taste, or a soft suggestion, or otherwise not blocking for merge. Comments that are _not_ resolved _are blocking to merge_ - only an MR with no open comments can be merged. If we call something out to be fixed, please leave a reply on that comment ("Fixed" is fine for simple stuff, for more complex stuff please explain what you did to address the comment) and let the person who left the comment resolve it.

#### Expectations for testing

Testing deserves a special callout. In general, we don't want merge requests to decrease coverage, and we do want all added or changed features to be tested. The ideal is that we be able to compare tests before and after - for a bug fix, this means "there is a test before your change that fails because of the bug, and that test passes after your ifx". For new functionality, this mostly means "none of our existing tests are broken by the new feature, which is itself tested."

### Here’s the general architecture of the software

**TODO**: What IS the general architecture of the software?

### Thanks!

Thanks for reading the guidelines, and thanks for looking at contributing to Chasm. We look forward to working with you and seeing your contribution!
