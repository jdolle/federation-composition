import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function FieldArgumentsOfTheSameTypeRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeFieldArg(objectTypeState, fieldState, argState) {
      const typeToGraphs = new Map<string, string[]>();

      argState.byGraph.forEach((arg, graphName) => {
        // We normalize the type to remove the non-null modifier
        // Yeah yeah yeah, we could use an object to define if it's a list or non-null or name etc
        // But this way is faster to iterate.
        // TODO: This needs to show `!` and `[]` modifiers as well
        // TODO: This needs a good comparison logic (e.g. `String!` and `String` are the same in context of fields and arguments)
        const isNonNullable = arg.type.endsWith("!");
        const isNonNullableInSupergraph = argState.type.endsWith("!");
        const isMatchingNonNullablePart =
          argState.type.replace(/!$/, "") === arg.type.replace(/!$/, "");
        let normalizedOutputType: string;

        // Turn User into User! (if super type is non-nullable)
        // Supergraph type | sign | Local type
        // -----------------------------------
        // `User!`           ===    `User`
        // `String!`         !==    `User`
        if (isMatchingNonNullablePart) {
          normalizedOutputType = isNonNullableInSupergraph
            ? isNonNullable
              ? arg.type
              : arg.type + "!"
            : arg.type;
        } else {
          normalizedOutputType = arg.type;
        }

        const existing = typeToGraphs.get(normalizedOutputType);

        if (existing) {
          existing.push(graphName);
        } else {
          typeToGraphs.set(normalizedOutputType, [graphName]);
        }
      });

      if (typeToGraphs.size > 1) {
        const groups = Array.from(typeToGraphs.entries()).map(
          ([outputType, graphs]) => {
            const plural = graphs.length > 1 ? "s" : "";
            return `type "${outputType}" in subgraph${plural} "${graphs
              .map(context.graphIdToName)
              .join('", "')}"`;
          },
        );
        const [first, second, ...rest] = groups;
        context.reportError(
          new GraphQLError(
            `Type of argument "${objectTypeState.name}.${fieldState.name}(${
              argState.name
            }:)" is incompatible across subgraphs: it has ${first} but ${second}${
              rest.length ? ` and ${rest.join(" and ")}` : ""
            }`,
            {
              extensions: {
                code: "FIELD_ARGUMENT_TYPE_MISMATCH",
              },
            },
          ),
        );
      }
    },
    DirectiveFieldArg(directiveState, argState) {
      if (directiveState.isExecutable === false) {
        // We only want to do this validation on executable directives
        return;
      }

      if (argState.byGraph.size !== context.subgraphStates.size) {
        // If the directive is not defined in all subgraphs it will be omitted from the supergraph
        return;
      }

      const typesPerSubgraph = new Map<string, Set<string>>();

      function collectSubgraphType(typeName: string, subgraphName: string) {
        let subgraphNames = typesPerSubgraph.get(typeName);
        if (subgraphNames === undefined) {
          subgraphNames = new Set();
          typesPerSubgraph.set(typeName, subgraphNames);
        }

        subgraphNames.add(subgraphName);
      }

      argState.byGraph.forEach((arg, graphName) => {
        collectSubgraphType(arg.type, graphName);
      });

      if (typesPerSubgraph.size === 1) {
        return;
      }

      const groups = Array.from(typesPerSubgraph.entries()).map(
        ([outputType, graphs]) => {
          const plural = graphs.size > 1 ? "s" : "";

          return `type "${outputType}" in subgraph${plural} ${joinItems(
            Array.from(graphs).map(context.graphIdToName),
          )}`;
        },
      );
      const [first, ...rest] = groups;
      context.reportError(
        new GraphQLError(
          `Type of argument "@${directiveState.name}(${argState.name}:)" is incompatible across subgraphs: it has ${first} but ${rest.join(
            " and ",
          )}`,
          {
            extensions: {
              code: "FIELD_ARGUMENT_TYPE_MISMATCH",
            },
          },
        ),
      );
    },
  };
}

function joinItems(items: string[]): string {
  if (items.length === 0) {
    return "";
  } else if (items.length === 1) {
    return `"${items[0]}"`;
  } else if (items.length === 2) {
    return `"${items[0]}" and "${items[1]}"`;
  } else {
    return `"${items.slice(0, -1).join(`", "`)}", and "${items[items.length - 1]}"`;
  }
}
