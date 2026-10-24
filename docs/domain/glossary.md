# Glossary

Sewing and CAD terms used across the codebase. Prefer these words in code,
UI copy and specs.

| Term                            | Meaning                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Block / sloper**              | A basic fitted pattern with no design ease, used as a base to modify.                                                                                                       |
| **Piece**                       | A closed loop of existing cut edges cut from fabric; carries a name, a cut quantity and per-edge allowances.                                                                |
| **Edge**                        | A single line, curve or arc that forms part of a piece boundary.                                                                                                            |
| **Construction geometry**       | Guide points/lines used to build the pattern; never cut or exported as a cut edge.                                                                                          |
| **Stitch loop**                 | A piece's boundary as drawn: what you sew on, or the fold at a finished edge.                                                                                               |
| **Cut loop**                    | The stitch loop offset outward per edge by its allowance and joined at every corner; what you cut.                                                                          |
| **Cut edge**                    | One whole straight loop edge addressed as an anchor (`{ edge, at: 'edge' }`), resolved to that edge's **own** cut segment.                                                  |
| **Cut line**                    | The infinite line through a cut edge's segment: the source line plus that edge's cut-distance offset.                                                                       |
| **Cut-distance offset**         | How far the cut line sits from the stitch line: the edge's finished `width`, or `2 × width` for a double fold.                                                              |
| **Allowance**                   | A per-edge strip on a piece: `kind` (`seam`, `single` fold, `double` fold) plus a finished `width`.                                                                         |
| **Finished width**              | The visible width of a seam or hem. The cut distance is derived: `width`, or `2 × width` for a double fold.                                                                 |
| **Fold line**                   | The turn line a double fold needs, at the finished width inside the cut line.                                                                                               |
| **Cut dimension**               | A read-only dimension measuring a piece's cut loop; derived from the stitch loop plus allowances.                                                                           |
| **Point-to-edge cut dimension** | A cut dimension from a corner to its perpendicular foot on a straight edge's cut line.                                                                                      |
| **Seam allowance**              | Extra material beyond the stitch line added to edges before cutting (commonly 1–1.5 cm). Legacy per-edge allowances live on `seams`; piece allowances are the current path. |
| **Stitch line**                 | The line the seam is actually sewn along, inside the seam allowance.                                                                                                        |
| **Dart**                        | A fold of fabric shaping it to the body, taken up from an edge to a point.                                                                                                  |
| **Grainline**                   | Arrow marking how the piece aligns with the fabric's lengthwise grain.                                                                                                      |
| **Notch**                       | Small mark on an edge for matching pieces when sewing.                                                                                                                      |
| **Truing**                      | Adjusting adjoining edges so seams match in length and shape.                                                                                                               |
| **Ease**                        | Extra room between body and garment; may be design or fitting ease.                                                                                                         |
| **Grading**                     | Producing a range of sizes from one pattern by moving points.                                                                                                               |
| **Facing / lining**             | Separate pieces finished to the inside of a garment.                                                                                                                        |
| **Nesting / layout**            | Arranging pieces on fabric of a given width to minimise waste.                                                                                                              |

## Geometry terms

| Term                     | Meaning                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Entity**               | A point, line, curve, circle or arc in the geometry document.                                                                                                                                                            |
| **Constraint**           | A relation the solver must satisfy (coincident, distance, …).                                                                                                                                                            |
| **Dimension**            | The CAD rendering of a `distance` constraint: extension lines, a chevron line, and an editable value.                                                                                                                    |
| **Set dimension**        | A dimension with a literal `value`: the solver drives the span and the label renders without parentheses.                                                                                                                |
| **Driven dimension**     | A dimension with no `value` and no `reference`: it measures the sketch, renders in parentheses and muted gray, and adds no solver equation.                                                                              |
| **Referenced dimension** | A dimension whose `reference` names another dimension: its effective value is derived from that source, it renders in square brackets and blue, and it drives the span with the resolved number.                         |
| **Broken dimension**     | A referenced dimension whose source is missing, driven or otherwise unresolvable: it keeps the last known reading, renders in square brackets with red and a warning glyph, and adds no solver equation until re-linked. |
| **Corner round**         | A tangent arc (fillet) replacing a sharp corner between two lines; both lines are trimmed to their tangent points.                                                                                                       |
| **Tangent point**        | The point where a line ends and a corner round's arc begins.                                                                                                                                                             |
| **Sharp corner**         | The original intersection of two lines, kept as a construction point while a corner round references it.                                                                                                                 |
| **Round bridge**         | The derived arc a corner round contributes to a piece loop between its two trimmed edges; never stored on the piece.                                                                                                     |
| **Rounded piece corner** | A piece loop corner where a committed corner round supplies the bridge; both adjacent edges must carry the same allowance.                                                                                               |
| **Feature tool**         | A tool that modifies existing sketch geometry rather than adding to it (Round corner today; notch and cut later); lives in the **Features** ribbon group.                                                                |
| **Derived dimension**    | A dimension computed from generated geometry and owning no solver variable; a cut dimension is one, and the solver never receives it.                                                                                    |
| **DOF**                  | Degrees of freedom left in a sketch.                                                                                                                                                                                     |
| **Converged**            | The solver reduced all residuals below tolerance.                                                                                                                                                                        |
| **Residual**             | The signed error of one constraint at the current coordinates.                                                                                                                                                           |

## Units

Everything is stored in **millimetres** as floats. Radians for angles. Display
units (cm/in) are a frontend concern only.
