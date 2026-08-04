'use client';

/**
 * Submitting one expense file: choose a named setting, choose a CSV, send it.
 *
 * The screen decides WHETHER to render this at all — it is left out of the markup
 * entirely for a session without the Importer role — the requirements' "Finance
 * Uploader" (brief BR4 / source UI-24) — so there is no role check, and no
 * disabled state, in here.
 *
 * Four things about this component are deliberate and easy to break:
 *
 * - **Only ACTIVE settings are offered** (brief §Data Model, `FileSetting.IsActive`).
 *   `GET /v1/file-settings` takes no parameters at all, so it answers with retired
 *   settings mixed in and narrowing the list is necessarily this screen's job.
 * - **The CSV check runs here, on selection, before any request** (brief BR3/R4). It
 *   is a check on the file's own NAME (R5), and a refused file never reaches the
 *   service — which is the observable difference between refusing in the browser and
 *   letting the backend refuse.
 * - **Every request is made from the BROWSER** through the shared API client
 *   (`lib/api/files.ts`, CLAUDE.md §2), at the app's own same-origin address, so the
 *   session cookie travels by itself.
 * - **The outcome is said in the page**, as one `role="alert"`: a confirmation that
 *   stays put while the list below re-reads itself, or — when the service refuses —
 *   the service's own reason, with the chosen setting and file left exactly as they
 *   were so the user can send it again without re-choosing anything (AC-5).
 *
 * When it reports things follows the project's form convention: presence is checked
 * when the user leaves a field, never on a keystroke. Choosing from a listbox and
 * choosing a file are not keystrokes — each is a single, finished decision — so those
 * two are checked as they happen, which is what lets a non-CSV be refused the moment
 * it is picked (BR3) instead of at submission time.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { serviceDetailOf, serviceMessageOf } from '@/lib/api/errors';
import {
  fetchFileSettings,
  uploadExpenseFile,
  uploadFailureMessage,
} from '@/lib/api/files';
import { announceFileSubmitted } from '@/lib/files/fileSubmissions';
import {
  expenseFileSubmissionSchema,
  type ExpenseFileSubmissionValues,
} from '@/lib/validation/schemas';

import type { ChangeEvent } from 'react';

import type { FileSettingRead, FileSettingReadList } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'submit-expense-file-heading';
const HEADING = 'Submit an expense file';

/** Announced while the named settings are being read. */
const LOADING_SETTINGS_MESSAGE = 'Loading the file settings…';

/** Names what did not happen, so the alert is not just an apology. */
const SETTINGS_FAILED_TITLE = 'Could not load the file settings';

/**
 * Shown when the settings read failed with nothing readable from the service — the
 * client's own placeholders are never put in front of a user (NFR-base-5).
 */
const SETTINGS_FAILED_MESSAGE =
  'The file settings could not be loaded, so there is nothing to submit a file against yet. Please try again.';

/** The service answered, but no setting is currently accepting files. */
const NO_ACTIVE_SETTINGS_MESSAGE =
  'No file settings are active at the moment, so no file can be submitted yet. Ask whoever maintains the file settings to activate one.';

/** What the picker says before a setting has been chosen. */
const SETTING_PLACEHOLDER = 'Select a file setting';

/**
 * Shown if the setting that was chosen is no longer among the ones on offer by the
 * time the file is sent — so the user is asked to choose again rather than having an
 * incomplete call made on their behalf (BR1).
 */
const CHOOSE_AGAIN_MESSAGE =
  'Choose a file setting and a CSV file, then submit again.';

/** One line explaining the asterisks, as every form in this project has. */
const RequiredMarker = () => <span aria-hidden="true">*</span>;

/** Where the read of the named settings is: being read, read, or unreadable. */
type SettingsState =
  | { phase: 'loading' }
  | { phase: 'loaded'; settings: FileSettingRead[] }
  | { phase: 'failed'; message: string };

const LOADING_SETTINGS: SettingsState = { phase: 'loading' };

/** Where this submission is: nothing sent, sending, accepted, or refused. */
type SubmissionState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'confirmed'; fileName: string; settingName: string }
  | { phase: 'refused'; message: string };

const NOTHING_SUBMITTED: SubmissionState = { phase: 'idle' };

const NOTHING_CHOSEN: ExpenseFileSubmissionValues = {
  fileSettingId: '',
  fileName: '',
};

/**
 * The settings a file may actually be submitted against, tolerating a body that
 * carries none. Retired settings are dropped here and nowhere else.
 */
const activeSettingsIn = (
  body: FileSettingReadList | undefined,
): FileSettingRead[] =>
  Array.isArray(body?.FileSettings)
    ? body.FileSettings.filter((setting) => setting.IsActive)
    : [];

export function SubmitExpenseFileForm() {
  const [settings, setSettings] = useState<SettingsState>(LOADING_SETTINGS);
  /** Bumped by Try again; asking for the settings again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);
  const [submission, setSubmission] =
    useState<SubmissionState>(NOTHING_SUBMITTED);
  /**
   * The file itself, held beside the form rather than in it: a file input's value
   * cannot be set from code, so the form carries the file's NAME (which is what the
   * rules are about) and the bytes live here.
   */
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  /**
   * Which file chooser is on screen. A file input's value cannot be set from code —
   * not even to nothing — so a finished submission leaves it showing the file that
   * has already gone. Bumping this replaces the input with a fresh one, which is the
   * only way to have it show nothing again.
   */
  const [chooserGeneration, setChooserGeneration] = useState(0);

  const form = useForm<ExpenseFileSubmissionValues>({
    resolver: zodResolver(expenseFileSubmissionSchema),
    // Presence is reported when the user leaves a control, and re-reported the same
    // way afterwards — never on a keystroke (the project's form convention).
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: NOTHING_CHOSEN,
  });

  useEffect(() => {
    // A read still in flight when this form goes away — or when the user asks for
    // the settings again — must not land on a screen that has moved on.
    let watching = true;

    void fetchFileSettings()
      .then((body) => {
        if (watching) {
          setSettings({ phase: 'loaded', settings: activeSettingsIn(body) });
        }
      })
      .catch((error: unknown) => {
        if (watching) {
          // The service's own wording when it sent one, from EITHER place a failure
          // can carry it — this service describes a failure with a 500, which leaves
          // the client's placeholder on `message` and the service's `Messages[]` on
          // `details` (the same pairing the refused-upload reason uses). Never the
          // placeholder itself.
          setSettings({
            phase: 'failed',
            message:
              serviceMessageOf(error) ??
              serviceDetailOf(error) ??
              SETTINGS_FAILED_MESSAGE,
          });
        }
      });

    return () => {
      watching = false;
    };
  }, [readsRequested]);

  const readSettingsAgain = (): void => {
    setSettings(LOADING_SETTINGS);
    setReadsRequested((reads) => reads + 1);
  };

  const offered = settings.phase === 'loaded' ? settings.settings : [];
  /**
   * What is currently chosen, watched rather than read: `useWatch` re-renders this
   * form when either choice changes, which is what keeps the submit control's
   * availability in step with them. (`form.watch()` would do the same but cannot be
   * memoized safely, which the React Compiler rejects.)
   */
  const chosen = useWatch({ control: form.control });
  /**
   * BR1: the call is not made until a setting, a file, and the file's own name are
   * all in hand — and the name has to identify a CSV. Asking the same schema that
   * validates the submission keeps the enabled state and the rules in step.
   */
  const readyToSubmit =
    chosenFile !== null &&
    expenseFileSubmissionSchema.safeParse(chosen).success &&
    submission.phase !== 'sending';

  /**
   * A chosen file is checked at once, before anything is sent (BR3/R4): the name
   * goes into the form and is validated on the spot, so a non-CSV is refused in
   * place and a CSV chosen afterwards clears that refusal (R7).
   */
  const onFileChosen = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.item(0) ?? null;
    setChosenFile(file);
    form.setValue('fileName', file?.name ?? '', { shouldValidate: true });
    // Last time's outcome no longer describes what is on screen.
    setSubmission(NOTHING_SUBMITTED);
  };

  /** Choosing from the listbox is one finished decision, so it is checked as it happens. */
  const onSettingChosen = (fileSettingId: string): void => {
    form.setValue('fileSettingId', fileSettingId, { shouldValidate: true });
    setSubmission(NOTHING_SUBMITTED);
  };

  const onSubmit = async (
    values: ExpenseFileSubmissionValues,
  ): Promise<void> => {
    const setting = offered.find(
      (candidate) => String(candidate.Id) === values.fileSettingId,
    );

    if (chosenFile === null || setting === undefined) {
      // Unreachable while the submit control is only offered with both in hand; if
      // the offered settings changed underfoot, say so rather than send a call that
      // BR1 says must not be made.
      setSubmission({ phase: 'refused', message: CHOOSE_AGAIN_MESSAGE });
      return;
    }

    setSubmission({ phase: 'sending' });

    try {
      await uploadExpenseFile({ file: chosenFile, setting });

      setSubmission({
        phase: 'confirmed',
        fileName: chosenFile.name,
        settingName: setting.Name,
      });
      // The upload's answer carries no file identifier, so the file becomes visible
      // only when the list below re-reads itself. This is what asks it to.
      announceFileSubmitted();
      // Ready for the next file: nothing chosen, and the chooser showing nothing.
      form.reset(NOTHING_CHOSEN);
      setChosenFile(null);
      setChooserGeneration((generation) => generation + 1);
    } catch (error) {
      // The chosen setting and file are deliberately left in place, so submitting
      // again needs no re-entry (AC-5).
      setSubmission({
        phase: 'refused',
        message: uploadFailureMessage(error),
      });
    }
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

      {submission.phase === 'confirmed' && (
        <Alert>
          <CircleCheck aria-hidden="true" />
          <AlertTitle className="line-clamp-none">File submitted</AlertTitle>
          <AlertDescription className="text-foreground">
            <p>
              {submission.fileName} was uploaded against the{' '}
              {submission.settingName} setting. It appears in the list below
              while it is validated and imported.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {submission.phase === 'refused' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            The file was not submitted
          </AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{submission.message}</p>
          </AlertDescription>
        </Alert>
      )}

      {settings.phase === 'loading' && (
        <p role="status" className="text-muted-foreground">
          {LOADING_SETTINGS_MESSAGE}
        </p>
      )}

      {settings.phase === 'failed' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {SETTINGS_FAILED_TITLE}
          </AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{settings.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={readSettingsAgain}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {settings.phase === 'loaded' && (
        <Form {...form}>
          <form
            // The app's own wording is the only wording shown: the browser's native
            // validation bubbles would otherwise pre-empt it, and they cannot be
            // worded to satisfy R2/R7.
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid max-w-xl gap-6"
          >
            <p className="text-muted-foreground text-sm">
              <RequiredMarker /> indicates a required field
            </p>

            {offered.length === 0 && (
              <p className="text-muted-foreground max-w-prose">
                {NO_ACTIVE_SETTINGS_MESSAGE}
              </p>
            )}

            <FormField
              control={form.control}
              name="fileSettingId"
              render={({ field }) => {
                const chosenSetting = offered.find(
                  (setting) => String(setting.Id) === field.value,
                );

                return (
                  <FormItem>
                    <FormLabel>
                      File setting <RequiredMarker />
                    </FormLabel>
                    <Select value={field.value} onValueChange={onSettingChosen}>
                      <FormControl>
                        {/* The trigger takes the id the label points at, so the
                            label reaches it. */}
                        <SelectTrigger
                          className="w-full"
                          name={field.name}
                          onBlur={field.onBlur}
                          aria-required="true"
                        >
                          <SelectValue placeholder={SETTING_PLACEHOLDER} />
                        </SelectTrigger>
                      </FormControl>
                      {/*
                        Each option carries the setting's NAME and nothing else: the
                        name is how the setting is identified in the picker, on the
                        submission and in the file list, so anything else read out
                        alongside it would only blur what was chosen. The chosen
                        setting's source and type are given below instead.
                      */}
                      <SelectContent>
                        {offered.map((setting) => (
                          <SelectItem
                            key={setting.Id}
                            value={String(setting.Id)}
                          >
                            {setting.Name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {chosenSetting === undefined
                        ? 'Choose the named setting this file should be imported against.'
                        : `Files for this setting come from ${chosenSetting.SourceName}, as ${chosenSetting.TypeName}.`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="fileName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    CSV file <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    {/*
                      A real file input, kept in the tab order so a keyboard user can
                      open the file chooser (feature NFR, WCAG 2.2 AA). `accept` is
                      only a hint to that chooser — a user can still pick "All files"
                      — which is why the CSV rule is enforced below rather than here.
                    */}
                    <Input
                      key={chooserGeneration}
                      type="file"
                      accept=".csv,text/csv"
                      required
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={onFileChosen}
                      className="h-auto py-1.5"
                    />
                  </FormControl>
                  <FormDescription>
                    {chosenFile === null ? (
                      'Choose the CSV file of expense payment requests to submit.'
                    ) : (
                      <>
                        Chosen file:{' '}
                        <span className="text-foreground font-medium">
                          {chosenFile.name}
                        </span>
                      </>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              {/*
                One submit control, whose wording never changes: it is how the action
                is recognised, so a busy state is expressed by disabling it (and by
                the confirmation that follows) rather than by renaming it mid-flight.
              */}
              <Button type="submit" disabled={!readyToSubmit}>
                Upload file
              </Button>
            </div>
          </form>
        </Form>
      )}
    </section>
  );
}
