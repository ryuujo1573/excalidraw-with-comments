import {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  NonDeleted,
} from "../element/types";
import { getNonDeletedElements, isNonDeletedElement } from "../element";
import { LinearElementEditor } from "../element/linearElementEditor";

type ElementIdKey = InstanceType<typeof LinearElementEditor>["elementId"];
type ElementKey = ExcalidrawElement | ElementIdKey;

type SceneStateCallback = () => void;
type SceneStateCallbackRemover = () => void;

const isIdKey = (elementKey: ElementKey): elementKey is ElementIdKey => {
  if (typeof elementKey === "string") {
    return true;
  }
  return false;
};

class Scene {
  // ---------------------------------------------------------------------------
  // static methods/props
  // ---------------------------------------------------------------------------

  // WeakMap 对象是一组键/值对的集合，其中的键是弱引用的。其键必须是对象，而值可以是任意的。
  // 对对象的弱引用是指当该对象应该被 GC 回收时不会阻止 GC 的回收行为。
  private static sceneMapByElement = new WeakMap<ExcalidrawElement, Scene>();
  private static sceneMapById = new Map<string, Scene>();

  static mapElementToScene(elementKey: ElementKey, scene: Scene) {
    if (isIdKey(elementKey)) {
      // for cases where we don't have access to the element object
      // (e.g. restore serialized appState with id references)
      this.sceneMapById.set(elementKey, scene);
    } else {
      this.sceneMapByElement.set(elementKey, scene);
      // if mapping element objects, also cache the id string when later
      // looking up by id alone
      this.sceneMapById.set(elementKey.id, scene);
    }
  }

  static getScene(elementKey: ElementKey): Scene | null {
    if (isIdKey(elementKey)) {
      return this.sceneMapById.get(elementKey) || null;
    }
    return this.sceneMapByElement.get(elementKey) || null;
  }

  // ---------------------------------------------------------------------------
  // instance methods/props
  // ---------------------------------------------------------------------------

  private callbacks: Set<SceneStateCallback> = new Set();

  private nonDeletedElements: readonly NonDeletedExcalidrawElement[] = [];
  private elements: readonly ExcalidrawElement[] = [];
  private elementsMap = new Map<ExcalidrawElement["id"], ExcalidrawElement>();

  getElementsIncludingDeleted() {
    return this.elements;
  }

  getNonDeletedElements(): readonly NonDeletedExcalidrawElement[] {
    return this.nonDeletedElements;
  }

  getElement<T extends ExcalidrawElement>(id: T["id"]): T | null {
    return (this.elementsMap.get(id) as T | undefined) || null;
  }

  getNonDeletedElement(
    id: ExcalidrawElement["id"],
  ): NonDeleted<ExcalidrawElement> | null {
    const element = this.getElement(id);
    if (element && isNonDeletedElement(element)) {
      return element;
    }
    return null;
  }

  replaceAllElements(nextElements: readonly ExcalidrawElement[]) {
    this.elements = nextElements;
    this.elementsMap.clear();
    nextElements.forEach((element) => {
      this.elementsMap.set(element.id, element);
      Scene.mapElementToScene(element, this);
    });
    this.nonDeletedElements = getNonDeletedElements(this.elements);
    this.informMutation();
  }

  informMutation() {
    for (const callback of Array.from(this.callbacks)) {
      callback();
    }
  }

  addCallback(cb: SceneStateCallback): SceneStateCallbackRemover {
    if (this.callbacks.has(cb)) {
      throw new Error();
    }

    this.callbacks.add(cb);

    return () => {
      if (!this.callbacks.has(cb)) {
        throw new Error();
      }
      this.callbacks.delete(cb);
    };
  }

  destroy() {
    Scene.sceneMapById.forEach((scene, elementKey) => {
      if (scene === this) {
        Scene.sceneMapById.delete(elementKey);
      }
    });
    // done not for memory leaks, but to guard against possible late fires
    // (I guess?)
    this.callbacks.clear();
  }
}

export default Scene;
