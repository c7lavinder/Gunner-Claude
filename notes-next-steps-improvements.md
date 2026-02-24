# Next Steps Improvements Analysis

## Issue 1: Action cards don't show payload details
- The LLM returns `reason` but no `summary` field — the frontend maps `reason` to `summary`
- The payload details (note content, stage name, task title) are hidden behind expand chevron
- Need to show a "preview line" of key payload values right on the card without expanding

## Issue 2: Auto-generate on grading
- processCall() in grading.ts ends at line ~1463
- After Step 9 (webhook), add Step 10 to call generateNextSteps logic
- Need to extract the LLM call into a shared function that both the tRPC procedure and processCall can use
- Store results in a new DB table `call_next_steps` so they persist

## Issue 3: Count badge on tab
- CallDetail.tsx has tabs: Coaching, Criteria, Transcript, Next Steps
- Need to query stored next steps count and show badge on tab trigger

## Frontend fix for payload preview
- In ActionCard, between the header and the action buttons, show key payload values inline
- For add_note: show noteBody preview
- For change_pipeline_stage: show "→ {stageName} in {pipelineName}"
- For create_task: show title and dueDate
- For send_sms: show message preview
- For update_task: show dueDate
- For create_appointment: show title and startTime
- For add_to_workflow/remove_from_workflow: show workflowName
