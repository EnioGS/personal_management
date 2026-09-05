# Images in the conversation

## Status

Accepted — extends adr/0027 (multi-provider assistant connections) and the
attachment handling that came with the chat panel.

## Context

Attachments were text: `.txt`, `.md` and `.csv`, read with `file.text()`, listed
in the system prompt by id, and fetched by `read_text_file` or `read_csv` when
the assistant asked for one. A screenshot of a statement, a photo of a receipt,
or a chart the user wants explained had nowhere to go, though both providers
the app talks to accept images.

## Decision

**An image is part of the message, not a file to be read.** There is no reading
an image a paragraph at a time, so it travels inside the turn as a content part
rather than behind a tool. `ChatAttachment` gains `kind`, absent meaning text —
so conversations saved before this need no migration — and images are left out
of the prompt's attachment listing, the model already seeing them.

**Images live on the message that carried them** (`ChatMessage.images`, data
URLs). Sending moves them off the composer and onto the message, where the
history is rebuilt from: a follow-up question about a chart needs the chart
still in context. Text attachments stay on the composer, since a tool may read
one again next turn.

**One content shape, translated per provider.** `OpenRouterMessage.content`
becomes `string | MessageContentPart[]`, in chat completions' vocabulary
(`text`, `image_url`), which OpenRouter and OpenAI's chat endpoint both take as
they are. `toResponsesInput` renames them for the responses API (`input_text`,
`input_image`, the URL unwrapped), the same translation it already does for
tool calls.

Limits: 5MB an image against 2MB for text, base64 adding a third to whatever is
sent; `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.

## Consequences

- Every turn after an image re-sends it, because it stays in the history. That
  is what makes follow-up questions work, and it is worth knowing before
  attaching a 5MB screenshot to a long conversation.
- Conversations persist their images, so a saved conversation carries its data
  URLs into IndexedDB.
- The tools still refuse images: `read_text_file` and `read_csv` parse text, and
  an image is not text.
