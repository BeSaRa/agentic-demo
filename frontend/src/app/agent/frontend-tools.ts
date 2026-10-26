import { Injectable, inject } from '@angular/core';
import type { Tool } from '@ag-ui/core';
import { Theme } from './theme';

export interface FrontendTool {
  /** Sent to the agent with every run so it knows the tool exists. */
  definition: Tool;
  /** Runs in the browser. The returned string goes back to the agent as the tool result. */
  execute(args: Record<string, unknown>): string | Promise<string>;
}

/** Tools the agent can call but the browser executes. */
@Injectable({ providedIn: 'root' })
export class FrontendTools {
  private readonly theme = inject(Theme);

  private readonly tools: FrontendTool[] = [
    {
      definition: {
        name: 'set_theme_color',
        description: 'Changes the accent color of the chat UI.',
        parameters: {
          type: 'object',
          properties: {
            color: { type: 'string', description: 'Any CSS color, e.g. "teal" or "#0d9488".' }
          },
          required: ['color'],
        },
      },
      execute: ({ color }) => {
        const applied = typeof color === 'string' && this.theme.setAccent(color);
        return applied ? `Theme color changed to ${color}.` : `"${color}" is not a valid CSS color.`;
      },
    },
  ];

  readonly definitions: Tool[] = this.tools.map((tool) => tool.definition);

  find(name: string): FrontendTool | undefined {
    return this.tools.find((tool) => tool.definition.name === name);
  }
}
