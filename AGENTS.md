<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep catalogue and store information in shared typed frontend data modules so all pages and ordering views use one source.
- Keep demo commerce in a root React context with hydration-safe localStorage persistence; no server services or real payment data are needed for the presentation.
- Use separate TanStack content routes and shared page components for navigation, with unique leaf metadata for social previews.
- Keep visual styling in global semantic design tokens and reusable Button variants to maintain the brand consistently.
