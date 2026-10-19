# Glossary

Sewing and CAD terms used across the codebase. Prefer these words in code,
UI copy and specs.

| Term                      | Meaning                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Block / sloper**        | A basic fitted pattern with no design ease, used as a base to modify.                          |
| **Piece**                 | A closed region of a pattern cut from fabric (e.g. bodice front). Referenced by ordered edges. |
| **Edge**                  | A single line or curve that forms part of a piece boundary.                                    |
| **Construction geometry** | Guide points/lines used to build the pattern; never cut or exported as a cut edge.             |
| **Seam allowance**        | Extra material beyond the stitch line added to edges before cutting (commonly 1–1.5 cm).       |
| **Stitch line**           | The line the seam is actually sewn along, inside the seam allowance.                           |
| **Dart**                  | A fold of fabric shaping it to the body, taken up from an edge to a point.                     |
| **Grainline**             | Arrow marking how the piece aligns with the fabric's lengthwise grain.                         |
| **Notch**                 | Small mark on an edge for matching pieces when sewing.                                         |
| **Truing**                | Adjusting adjoining edges so seams match in length and shape.                                  |
| **Ease**                  | Extra room between body and garment; may be design or fitting ease.                            |
| **Grading**               | Producing a range of sizes from one pattern by moving points.                                  |
| **Facing / lining**       | Separate pieces finished to the inside of a garment.                                           |
| **Nesting / layout**      | Arranging pieces on fabric of a given width to minimise waste.                                 |

## Geometry terms

| Term           | Meaning                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **Entity**     | A point, line or curve in the geometry document.                                                              |
| **Constraint** | A relation the solver must satisfy (coincident, distance, …).                                                 |
| **Dimension**  | The CAD rendering of a driving `distance` constraint: extension lines, a chevron line, and an editable value. |
| **DOF**        | Degrees of freedom left in a sketch.                                                                          |
| **Converged**  | The solver reduced all residuals below tolerance.                                                             |
| **Residual**   | The signed error of one constraint at the current coordinates.                                                |

## Units

Everything is stored in **millimetres** as floats. Radians for angles. Display
units (cm/in) are a frontend concern only.
