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
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS DRAWN — the batch's submission slip (`files-view-redesign` R13)
 * ---------------------------------------------------------------------------
 * This slip sits directly above the register of submitted files on the same screen,
 * so it is set in the register's own notation and not in a dialect of its own. Every
 * piece of that notation is IMPORTED from `components/requests/fieldNotation.ts` and
 * never restated here (BR6):
 *
 * - **The slip is a ruled field strip, not a card.** The form runs full-bleed to the
 *   page padding (`FULL_BLEED_CLASS`) and is closed by one hairline at its foot, so it
 *   reads as the opening section of the same document the register below continues —
 *   exactly as the expense request list's narrowing strip stands above its listing.
 *   There is no panel, no surface and no radius anywhere on it (BR9).
 * - **A field is an underline and nothing else** (`RULED_FIELD_CLASS`): the setting
 *   selector and the CSV field carry no box, no fill and no corner. The underline's
 *   COLOUR is deliberately left to the primitives' own `border-input`, which is the
 *   darker of the two hairline tokens precisely so it clears 3:1 against the ground
 *   (WCAG 1.4.11) now that it is the only thing outlining the field.
 * - **The focus ring is untouched, and that is load-bearing.** Taking the box away is
 *   what makes it possible to lose the focus indicator with it, and an underline-only
 *   field that paints nothing when the keyboard arrives leaves a keyboard user unable
 *   to see where they are (R4, WCAG 2.2 AA). The primitives' ring is this project's one
 *   focus notation, so nothing here cancels it — `shadow-none` in the shared notation
 *   removes the resting shadow only, which is also what makes the ring visible AS a
 *   change when it lands.
 * - **A label is a tracked micro-label** (`LISTING_LABEL_CLASS` — the same object the
 *   register's column heads and this section's own heading are), and the capitals are
 *   `text-transform` — never retyped words. The wording a screen reader is given, and
 *   the accessible name each control takes from its label, are still the app's own
 *   sentence-case words, asterisk included. A printed slip labels itself in the notation
 *   it is set in, and a bold sentence-case title here would be the last of the card era's
 *   hierarchy left above a ruled page.
 * - **What the slip reports back is in the control-total grammar**: the report's own
 *   title is a tracked micro-label (`RULED_ALERT_TITLE_CLASS`) and every identifier inside
 *   it — the file's name, the setting's name — is set in the fixed-field face
 *   (`NOTATION_CELL_CLASS`), the same face the register prints those two values in one
 *   line further down. Each report is a full-bleed band closed by hairlines
 *   (`RULED_BAND_CLASS`) with the alert primitive's card stripped off it
 *   (`RULED_ALERT_CLASS`), so an answer belongs to the slip rather than floating over it.
 * - **The submit is a tracked label on a rule** (`RULED_ACTION_WITH_ICON_CLASS`, its
 *   glyph sized on the ICON), not a filled button: this slip has no boxes left for one
 *   to match. Its wording, and its staying unavailable until a setting and a CSV are
 *   both in hand, are unchanged.
 *
 * Nothing in this redraw changes what the slip accepts, what it refuses, when it can be
 * sent, what it says, or who it is rendered for (`files-view-redesign` R1/BR1/BR2).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  FULL_BLEED_CLASS,
  LISTING_LABEL_CLASS,
  NOTATION_CELL_CLASS,
  RULED_ACTION_CLASS,
  RULED_ACTION_ICON_CLASS,
  RULED_ACTION_WITH_ICON_CLASS,
  RULED_ALERT_CLASS,
  RULED_ALERT_TITLE_CLASS,
  RULED_BAND_CLASS,
  RULED_FIELD_CLASS,
} from '@/components/requests/fieldNotation';
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
 * Names the file the user picked, beside the name itself — a tracked label over a
 * fixed-field value, which is how every stated value on these two screens reads.
 */
const CHOSEN_FILE_LABEL = 'Chosen file';

/**
 * Shown if the setting that was chosen is no longer among the ones on offer by the
 * time the file is sent — so the user is asked to choose again rather than having an
 * incomplete call made on their behalf (BR1).
 */
const CHOOSE_AGAIN_MESSAGE =
  'Choose a file setting and a CSV file, then submit again.';

/** One line explaining the asterisks, as every form in this project has. */
const RequiredMarker = () => <span aria-hidden="true">*</span>;

/**
 * A field's own label: the shared tracked micro-label at the muted ink — the same object
 * the register's column heads and this section's own heading are (`LISTING_LABEL_CLASS`,
 * imported and never restated, R9/BR6) — with the gap the required marker beside it needs,
 * tighter than the `label` primitive's own, which was sized for 14px words.
 */
const SLIP_FIELD_LABEL_CLASS = `${LISTING_LABEL_CLASS} gap-1.5`;

/**
 * The setting selector: the shared ruled notation (an underline and nothing else, its
 * COLOUR left to the primitive's `border-input`), set in the fixed-field face because a
 * setting's name is an identifier — the same face the register one line below prints it
 * in. Size and width belong here rather than to the notation.
 */
const SETTING_FIELD_CLASS = `${RULED_FIELD_CLASS} ${NOTATION_CELL_CLASS} h-9 w-full text-sm`;

/**
 * The CSV field: the same ruled notation, sized to hold the browser's own file-chooser
 * chrome (which sets its own height, so this field states none).
 *
 * The three `file:*` utilities are about that chrome and nothing else. A
 * `::file-selector-button` does NOT inherit the field's font-family from the user agent,
 * so it needs the fixed-field face stated at it or it renders in the text face beside a
 * mono file name — two faces inside one field. Its weight comes down to the notation's
 * for the same reason (the primitive ships it at `font-medium`, which reads as emphasis
 * on a field whose whole treatment is withholding), and it needs a margin of its own,
 * since with the field's own padding removed there is otherwise nothing at all between
 * the button and the name of the file beside it.
 */
const CSV_FIELD_CLASS = `${RULED_FIELD_CLASS} ${NOTATION_CELL_CLASS} h-auto w-full py-1.5 text-sm file:me-3 file:font-mono file:font-normal`;

/**
 * How wide each field sits before the slip's line wraps onto the next one. Each states a
 * basis AND a minimum: the basis decides where the line wraps, the minimum stops a field
 * being squeezed narrower than what it holds. Neither grows, so on a wide screen the slip
 * stays a slip rather than stretching two underlines across the whole page. Wrapping,
 * never sideways scrolling — this has to hold at 360px (R3).
 */
const SETTING_FIELD_WIDTH_CLASS = 'min-w-56 basis-64';
const CSV_FIELD_WIDTH_CLASS = 'min-w-56 basis-80';

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
      {/* The slip's own name, in the same tracked micro-label notation as the register
          below it and as the labels on its own fields — a printed slip labels itself in
          the notation it is set in (R13). The capitals are `text-transform`, so the
          heading a screen reader is given, and the name this section is found by, are
          still the words the app wrote. */}
      <h2 id={HEADING_ID} className={LISTING_LABEL_CLASS}>
        {HEADING}
      </h2>

      {/* What the slip reports back, in the control-total grammar (R13): a tracked
          micro-label title over the sentence, with the file's own name and the setting's
          name set in the fixed-field face — the same face the register prints those two
          values in. Composed as a full-bleed ruled band with the alert primitive's card
          stripped off, so the answer reads as part of this document rather than as a
          panel floating over it (BR9). Its role and its wording are untouched. */}
      {submission.phase === 'confirmed' && (
        <div className={`${RULED_BAND_CLASS} py-4`}>
          <Alert className={RULED_ALERT_CLASS}>
            <CircleCheck aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              File submitted
            </AlertTitle>
            <AlertDescription className="text-foreground">
              <p>
                <span className={NOTATION_CELL_CLASS}>
                  {submission.fileName}
                </span>{' '}
                was uploaded against the{' '}
                <span className={NOTATION_CELL_CLASS}>
                  {submission.settingName}
                </span>{' '}
                setting. It appears in the list below while it is validated and
                imported.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {submission.phase === 'refused' && (
        <div className={`${RULED_BAND_CLASS} py-4`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              The file was not submitted
            </AlertTitle>
            <AlertDescription className="text-foreground">
              <p>{submission.message}</p>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* A wait of a moment, said and not drawn — no rule of its own, exactly as the
          register's own in-flight lines are, so the slip does not flash a hairline into
          place and out again while the settings arrive. */}
      {settings.phase === 'loading' && (
        <p role="status" className="text-muted-foreground text-sm">
          {LOADING_SETTINGS_MESSAGE}
        </p>
      )}

      {/* The read left the reader with no slip at all, so this band stands where the
          fields would be — ruled and full-bleed like them. The wording, the role and the
          retry are unchanged, the retry now wearing the same ruled notation as every
          other control on the screen: words on a rule, no box. */}
      {settings.phase === 'failed' && (
        <div className={`${RULED_BAND_CLASS} py-4`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              {SETTINGS_FAILED_TITLE}
            </AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p>{settings.message}</p>
              <Button
                type="button"
                variant="ghost"
                className={RULED_ACTION_CLASS}
                onClick={readSettingsAgain}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {settings.phase === 'loaded' && (
        <Form {...form}>
          <form
            // The app's own wording is the only wording shown: the browser's native
            // validation bubbles would otherwise pre-empt it, and they cannot be
            // worded to satisfy R2/R7.
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            /* The slip runs full-bleed to the page padding and is closed by one
               hairline at its foot (R13): it is the opening section of the same ruled
               document the register below continues, not a card of its own sitting on
               top of one. The rule's colour is `border-input` for the reason the shared
               field notation states — with no box anywhere on the slip, a hairline is
               the only thing outlining it, and the lighter token would drop it below
               3:1 (WCAG 1.4.11). */
            className={`${FULL_BLEED_CLASS} border-input grid gap-5 border-b pb-5`}
          >
            <p className="text-muted-foreground text-sm">
              <RequiredMarker /> indicates a required field
            </p>

            {offered.length === 0 && (
              <p className="text-muted-foreground max-w-prose">
                {NO_ACTIVE_SETTINGS_MESSAGE}
              </p>
            )}

            {/* The two fields on one line, wrapping onto the next rather than ever
                scrolling the page sideways (R3). Aligned at their tops, since each
                carries a line of its own beneath it. */}
            <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
              <FormField
                control={form.control}
                name="fileSettingId"
                render={({ field }) => {
                  const chosenSetting = offered.find(
                    (setting) => String(setting.Id) === field.value,
                  );

                  return (
                    <FormItem
                      className={`gap-1.5 ${SETTING_FIELD_WIDTH_CLASS}`}
                    >
                      {/* The label is the tracked micro-label; the capitals are CSS,
                          so the words — and the accessible name the trigger takes from
                          them, asterisk included — are unchanged. */}
                      <FormLabel className={SLIP_FIELD_LABEL_CLASS}>
                        File setting <RequiredMarker />
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={onSettingChosen}
                      >
                        <FormControl>
                          {/* The trigger takes the id the label points at, so the
                              label reaches it. Underline only, and no box. */}
                          <SelectTrigger
                            className={SETTING_FIELD_CLASS}
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
                        {chosenSetting === undefined ? (
                          'Choose the named setting this file should be imported against.'
                        ) : (
                          <>
                            Files for this setting come from{' '}
                            <span className={NOTATION_CELL_CLASS}>
                              {chosenSetting.SourceName}
                            </span>
                            , as{' '}
                            <span className={NOTATION_CELL_CLASS}>
                              {chosenSetting.TypeName}
                            </span>
                            .
                          </>
                        )}
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
                  <FormItem className={`gap-1.5 ${CSV_FIELD_WIDTH_CLASS}`}>
                    <FormLabel className={SLIP_FIELD_LABEL_CLASS}>
                      CSV file <RequiredMarker />
                    </FormLabel>
                    <FormControl>
                      {/*
                        A real file input, kept in the tab order so a keyboard user can
                        open the file chooser (feature NFR, WCAG 2.2 AA) — the ruled
                        treatment takes the box away and NOTHING else: this must never
                        become a styled div with a click handler, which takes no focus
                        and opens no chooser. `accept` is only a hint to that chooser —
                        a user can still pick "All files" — which is why the CSV rule is
                        enforced below rather than here.
                      */}
                      <Input
                        key={chooserGeneration}
                        type="file"
                        accept=".csv,text/csv"
                        required
                        name={field.name}
                        onBlur={field.onBlur}
                        onChange={onFileChosen}
                        className={CSV_FIELD_CLASS}
                      />
                    </FormControl>
                    {/* Once a file is picked, its name is stated as a tracked label
                        over a fixed-field value — the slip's own control total. */}
                    <FormDescription className="flex flex-wrap items-baseline gap-x-2">
                      {chosenFile === null ? (
                        'Choose the CSV file of expense payment requests to submit.'
                      ) : (
                        <>
                          <span className={LISTING_LABEL_CLASS}>
                            {CHOSEN_FILE_LABEL}
                          </span>
                          <span
                            className={`${NOTATION_CELL_CLASS} text-foreground`}
                          >
                            {chosenFile.name}
                          </span>
                        </>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              {/*
                One submit control, whose wording never changes: it is how the action
                is recognised, so a busy state is expressed by disabling it (and by
                the confirmation that follows) rather than by renaming it mid-flight.

                A tracked label on a rule, not a filled button — the slip has no boxes
                left for one to match (R13/R19/BR9). Its glyph is sized on the ICON,
                because the button primitive's own selector beats a size set on the
                button. Wrapped, so it takes its own width rather than the grid's.
              */}
              <Button
                type="submit"
                variant="ghost"
                className={RULED_ACTION_WITH_ICON_CLASS}
                disabled={!readyToSubmit}
              >
                <Upload
                  aria-hidden="true"
                  className={RULED_ACTION_ICON_CLASS}
                />
                Upload file
              </Button>
            </div>
          </form>
        </Form>
      )}
    </section>
  );
}
