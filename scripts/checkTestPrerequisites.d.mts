export interface TestPrerequisiteCommands {
    importModule?: (specifier: string) => Promise<unknown>;
    runCommand?: (command: string, args: string[]) => unknown;
}

export declare function verifyTestPrerequisites(options?: TestPrerequisiteCommands): Promise<string[]>;
