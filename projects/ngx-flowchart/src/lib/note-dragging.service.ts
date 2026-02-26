import { FcModelService } from './model.service';
import { FcNode, FcNote } from './ngx-flowchart.models';

export enum NoteDragMode {
  None = 'none',
  Pending = 'pending',   // mousedown recorded, waiting for drag threshold
  Move = 'move',
  ResizeSE = 'resize-se',
  ResizeS = 'resize-s',
  ResizeE = 'resize-e'
}

const NOTE_MIN_WIDTH = 80;
const NOTE_MIN_HEIGHT = 60;
const DRAG_THRESHOLD = 1;

interface NoteDraggingState {
  mode: NoteDragMode;
  pendingNote: FcNote | null;
  notes: FcNote[];
  offsets: Array<{ x: number; y: number }>;
  nodes: FcNode[];
  nodeOffsets: Array<{ x: number; y: number }>;
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
    pendingNote: null,
    notes: [],
    offsets: [],
    nodes: [],
    nodeOffsets: [],
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
    return (this.state.mode === NoteDragMode.Move || this.state.mode === NoteDragMode.ResizeSE ||
            this.state.mode === NoteDragMode.ResizeS || this.state.mode === NoteDragMode.ResizeE) &&
      (this.state.notes.includes(note) || this.state.resizeNote === note);
  }

  public startMove(event: MouseEvent, note: FcNote) {
    if (note.readonly) {
      return;
    }
    event.stopPropagation();

    // Do not touch selection here — wait for the drag threshold before committing.
    // This avoids a brief flash of magnet nodes being selected when the user just clicks.
    this.state = {
      mode: NoteDragMode.Pending,
      pendingNote: note,
      notes: [],
      offsets: [],
      nodes: [],
      nodeOffsets: [],
      resizeNote: null,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWidth: 0,
      startHeight: 0
    };

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private commitMove(event: MouseEvent) {
    const note = this.state.pendingNote;
    const notesToMove: FcNote[] = [];
    const nodesToMove: FcNode[] = [];

    if (this.modelService.notes.isSelected(note)) {
      // Group drag: move exactly what the user selected — no magnet.
      notesToMove.push(...this.modelService.notes.getSelectedNotes());
      nodesToMove.push(...this.modelService.nodes.getSelectedNodes());
    } else {
      // Solo drag: deselect everything, then magnet — pick up nodes and nested notes
      // whose center lies within this note's bounds.
      this.modelService.deselectAll();
      this.modelService.notes.select(note);
      notesToMove.push(note);

      const magnetNodes = this.modelService.getNodesInNoteBounds(note);
      magnetNodes.forEach(n => this.modelService.nodes.select(n));
      nodesToMove.push(...magnetNodes);

      const magnetNotes = this.modelService.getNotesInNoteBounds(note);
      magnetNotes.forEach(n => this.modelService.notes.select(n));
      notesToMove.push(...magnetNotes);
    }

    // Offsets encode (canvas_pos - mouse_pos) so that on each mousemove:
    // new_pos = offset + current_mouse = start_pos + delta_mouse
    const offsets = notesToMove.map(n => ({
      x: n.x - event.clientX,
      y: n.y - event.clientY
    }));

    const nodeOffsets = nodesToMove.map(n => ({
      x: n.x - event.clientX,
      y: n.y - event.clientY
    }));

    this.state = {
      ...this.state,
      mode: NoteDragMode.Move,
      pendingNote: null,
      notes: notesToMove,
      offsets,
      nodes: nodesToMove,
      nodeOffsets
    };
  }

  public startResize(event: MouseEvent, note: FcNote, mode: NoteDragMode) {
    if (note.readonly) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    this.state = {
      mode,
      pendingNote: null,
      notes: [],
      offsets: [],
      nodes: [],
      nodeOffsets: [],
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
    if (this.state.mode === NoteDragMode.Pending) {
      const absDx = Math.abs(event.clientX - this.state.startMouseX);
      const absDy = Math.abs(event.clientY - this.state.startMouseY);
      if (absDx > DRAG_THRESHOLD || absDy > DRAG_THRESHOLD) {
        // Threshold crossed — commit selection and switch to Move.
        // Offsets are computed from this event so the note starts tracking
        // from its current canvas position without any visual jump.
        this.applyFunction(() => this.commitMove(event));
      }
      return;
    }

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
        for (let i = 0; i < this.state.nodes.length; i++) {
          const node = this.state.nodes[i];
          const offset = this.state.nodeOffsets[i];
          node.x = Math.round(Math.max(0, offset.x + event.clientX));
          node.y = Math.round(Math.max(0, offset.y + event.clientY));
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
      if (this.state.mode !== NoteDragMode.Pending) {
        this.modelService.notifyModelChanged();
      }
      this.state.mode = NoteDragMode.None;
      this.state.pendingNote = null;
      this.state.notes = [];
      this.state.offsets = [];
      this.state.nodes = [];
      this.state.nodeOffsets = [];
      this.state.resizeNote = null;
    });
  }
}
