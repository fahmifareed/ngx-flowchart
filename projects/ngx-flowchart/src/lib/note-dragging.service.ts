import { FcModelService } from './model.service';
import { FcNote } from './ngx-flowchart.models';

export enum NoteDragMode {
  None = 'none',
  Move = 'move',
  ResizeSE = 'resize-se',
  ResizeS = 'resize-s',
  ResizeE = 'resize-e'
}

const NOTE_MIN_WIDTH = 80;
const NOTE_MIN_HEIGHT = 60;

interface NoteDraggingState {
  mode: NoteDragMode;
  notes: FcNote[];
  offsets: Array<{ x: number; y: number }>;
  resizeNote: FcNote | null;
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
}

export class FcNoteDraggingService {

  private readonly modelService: FcModelService;
  private readonly applyFunction: <T>(fn: (...args: any[]) => T) => T;

  private state: NoteDraggingState = {
    mode: NoteDragMode.None,
    notes: [],
    offsets: [],
    resizeNote: null,
    startMouseX: 0,
    startMouseY: 0,
    startWidth: 0,
    startHeight: 0
  };

  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;

  constructor(modelService: FcModelService,
              applyFunction: <T>(fn: (...args: any[]) => T) => T) {
    this.modelService = modelService;
    this.applyFunction = applyFunction;

    this.onMouseMove = this.mousemove.bind(this);
    this.onMouseUp = this.mouseup.bind(this);
  }

  public isDraggingNote(note: FcNote): boolean {
    return this.state.mode !== NoteDragMode.None &&
      (this.state.notes.includes(note) || this.state.resizeNote === note);
  }

  public startMove(event: MouseEvent, note: FcNote) {
    if (note.readonly) {
      return;
    }
    event.stopPropagation();

    const notesToMove: FcNote[] = [];
    if (this.modelService.notes.isSelected(note)) {
      notesToMove.push(...this.modelService.notes.getSelectedNotes());
    } else {
      this.modelService.deselectAll();
      this.modelService.notes.select(note);
      notesToMove.push(note);
    }

    const offsets = notesToMove.map(n => ({
      x: n.x - event.clientX,
      y: n.y - event.clientY
    }));

    this.state = {
      mode: NoteDragMode.Move,
      notes: notesToMove,
      offsets,
      resizeNote: null,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWidth: 0,
      startHeight: 0
    };

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  public startResize(event: MouseEvent, note: FcNote, mode: NoteDragMode) {
    if (note.readonly) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    this.state = {
      mode,
      notes: [],
      offsets: [],
      resizeNote: note,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWidth: note.width,
      startHeight: note.height
    };

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private mousemove(event: MouseEvent) {
    this.applyFunction(() => {
      const dx = event.clientX - this.state.startMouseX;
      const dy = event.clientY - this.state.startMouseY;

      if (this.state.mode === NoteDragMode.Move) {
        for (let i = 0; i < this.state.notes.length; i++) {
          const note = this.state.notes[i];
          const offset = this.state.offsets[i];
          note.x = Math.round(Math.max(0, offset.x + event.clientX));
          note.y = Math.round(Math.max(0, offset.y + event.clientY));
        }
      } else if (this.state.resizeNote) {
        const note = this.state.resizeNote;
        if (this.state.mode === NoteDragMode.ResizeSE) {
          note.width = Math.max(NOTE_MIN_WIDTH, Math.round(this.state.startWidth + dx));
          note.height = Math.max(NOTE_MIN_HEIGHT, Math.round(this.state.startHeight + dy));
        } else if (this.state.mode === NoteDragMode.ResizeS) {
          note.height = Math.max(NOTE_MIN_HEIGHT, Math.round(this.state.startHeight + dy));
        } else if (this.state.mode === NoteDragMode.ResizeE) {
          note.width = Math.max(NOTE_MIN_WIDTH, Math.round(this.state.startWidth + dx));
        }
      }
    });
  }

  private mouseup(_event: MouseEvent) {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);

    this.applyFunction(() => {
      this.modelService.notifyModelChanged();
      this.state.mode = NoteDragMode.None;
      this.state.notes = [];
      this.state.offsets = [];
      this.state.resizeNote = null;
    });
  }
}
