# Screenshot Demo mode

Open **Connections** and turn on **Demo mode** before sharing screenshots. The switch stays in the modal and updates the main window plus every Dashboard window. The title/status identifies sample data. **Randomize sample data** in Connections, or the normal Refresh button, creates a new synthetic dataset; ordinary redraws keep readings stable.

Demo mode uses seven synthetic provider fixtures with randomized activity, allowance percentages, credits, costs, targets and account ages. Values are generated independently of your usage. Connection paths, saved-key indicators, real local financial records, errors and sign-in messages are excluded from demo snapshots. Existing open detail forms are closed and cleared when switching modes. Live credential and account-setting actions are disabled while demo is active.

The preference is saved locally, so quitting and reopening cannot silently reveal live readings. Each launch generates a fresh synthetic dataset. Turning the switch off restores the live cache/settings and requests fresh usage. Real keys, account records and usage history are preserved. Synthetic readings never enter the live cache. A failed preference write keeps demo visible and reports that the setting could not be saved.

No new provider reads start in demo mode. Requests already sent before enabling it may finish, but their late results are discarded; they cannot replace demo readings or overwrite a newer live result after a mode change. Exports retain the `demo` marker, include only the displayed synthetic snapshot and use a `Tokenlight-demo-…` filename. A snapshot is captured before the save dialog so another mode change cannot replace its data during export.

The existing `TOKENLIGHT_DEMO=1` / `--demo` startup option also starts safely in Demo mode. It overrides a saved live preference at launch, and can be turned off for that running session. This feature masks Tokenlight's displayed data; screenshots can still contain other apps, system notifications or desktop information.
